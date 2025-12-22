/**
 * PgBoss wrapper with a fluent builder pattern for job creation.
 */
import { PgBoss } from 'pg-boss';
import type { z } from 'zod';
import { trackJobInvocation } from '@/utils/job-tracker';
import { logger } from '@/utils/logger';

// ============================================================================
// Types
// ============================================================================

type JobData = Record<string, unknown>;

interface RetryOptions {
    limit?: number;
    delay?: number;
    backoff?: boolean;
}

interface DelayOptions {
    seconds?: number;
}

interface DebounceOptions<T> {
    seconds: number;
    key?: (data: T) => string;
}

interface ScheduleOptions<T> {
    cron: string;
    data?: T;
}

interface WorkOptions {
    batchSize?: number; // Number of jobs to fetch and process per handler invocation
}

type WorkHandler<T> = (jobs: Array<{ id: string; data: T }>) => void | Promise<void>;

// ============================================================================
// Job Builder
// ============================================================================

class Job<T extends JobData> {
    private readonly bossWrapper: BossWrapper;
    private readonly jobName: string;
    private inputSchema?: z.ZodType<T>;
    private retryOptions?: RetryOptions;
    private delayOptions?: DelayOptions;
    private debounceOptions?: DebounceOptions<T>;
    private scheduleOptions?: ScheduleOptions<T>;
    private workFn?: WorkHandler<T>;
    private workOpts?: WorkOptions;

    constructor(bossWrapper: BossWrapper, name: string) {
        this.bossWrapper = bossWrapper;
        this.jobName = name;
    }

    /**
     * Define the input schema for job data validation.
     */
    input<U extends JobData>(schema: z.ZodType<U>): Job<U> {
        const job = this as unknown as Job<U>;
        job.inputSchema = schema;
        return job;
    }

    /**
     * Configure retry behavior.
     */
    retry(options: RetryOptions): this {
        this.retryOptions = options;
        return this;
    }

    /**
     * Configure delay before job execution.
     */
    delay(options: DelayOptions): this {
        this.delayOptions = options;
        return this;
    }

    /**
     * Configure debouncing to prevent duplicate jobs.
     */
    debounce(options: DebounceOptions<T>): this {
        this.debounceOptions = options;
        return this;
    }

    /**
     * Configure a cron schedule for recurring jobs.
     */
    schedule(options: ScheduleOptions<T>): this {
        this.scheduleOptions = options;
        return this;
    }

    /**
     * Configure work options (batchSize, teamSize, etc.).
     */
    options(options: WorkOptions): this {
        this.workOpts = { ...this.workOpts, ...options };
        return this;
    }

    /**
     * Define the work function for this job.
     */
    work(fn: WorkHandler<T>): this {
        this.workFn = fn;
        return this;
    }

    /**
     * Register this job with pg-boss (starts worker and schedule if configured).
     * Called automatically by boss.registerAll() or can be called manually.
     */
    async register(): Promise<void> {
        if (!this.workFn) {
            throw new Error(`Job "${this.jobName}" has no work function defined. Use .work() first.`);
        }

        const pgBoss = this.bossWrapper.getInstance();
        const workOptions: Record<string, unknown> = {};
        if (this.workOpts?.batchSize) {
            workOptions.batchSize = this.workOpts.batchSize;
        }

        // pg-boss v10+ requires explicit queue creation before work() or schedule()
        await pgBoss.createQueue(this.jobName);

        // Set up schedule if configured
        if (this.scheduleOptions) {
            try {
                await pgBoss.unschedule(this.jobName);
            } catch {
                // Ignore if schedule doesn't exist
            }

            await pgBoss.schedule(this.jobName, this.scheduleOptions.cron, this.scheduleOptions.data ?? {}, { tz: 'UTC' });
        }

        // Register the worker with automatic tracking
        await pgBoss.work<T>(this.jobName, workOptions, async jobs => {
            const startTime = new Date();
            let success = false;
            let error: string | undefined;

            try {
                // Execute the work function with the jobs
                await this.workFn?.(jobs.map(j => ({ id: j.id, data: j.data })));
                success = true;
            } catch (err) {
                error = err instanceof Error ? err.message : String(err);
                throw err; // Re-throw to let pg-boss handle retries
            } finally {
                const endTime = new Date();
                // Track the job invocation (don't await to avoid blocking)
                trackJobInvocation(this.jobName, startTime, endTime, success, error, {
                    jobCount: jobs.length,
                }).catch(trackErr => {
                    // Silently fail tracking - don't break job execution
                    logger.error({ err: trackErr, jobName: this.jobName }, 'Failed to track job invocation');
                });
            }
        });
    }

    /**
     * Emit a job to be processed.
     */
    async emit(data: T): Promise<string | null> {
        const pgBoss = this.bossWrapper.getInstance();

        // Validate input if schema is defined
        if (this.inputSchema) {
            this.inputSchema.parse(data);
        }

        // pg-boss v10+ requires explicit queue creation before send()
        await pgBoss.createQueue(this.jobName);

        const options: Record<string, unknown> = {};

        if (this.retryOptions) {
            if (this.retryOptions.limit !== undefined) options.retryLimit = this.retryOptions.limit;
            if (this.retryOptions.delay !== undefined) options.retryDelay = this.retryOptions.delay;
            if (this.retryOptions.backoff !== undefined) options.retryBackoff = this.retryOptions.backoff;
        }

        if (this.delayOptions?.seconds) {
            options.startAfter = this.delayOptions.seconds;
        }

        let jobId: string | null;
        if (this.debounceOptions) {
            const key = this.debounceOptions.key?.(data) ?? this.jobName;
            jobId = await pgBoss.sendDebounced(this.jobName, data, options, this.debounceOptions.seconds, key);
        } else {
            jobId = await pgBoss.send(this.jobName, data, options);
        }
        return jobId;
    }
}

// ============================================================================
// Boss Wrapper
// ============================================================================

class BossWrapper {
    private instance: PgBoss | null = null;
    private jobs: Job<any>[] = [];

    /**
     * Create a new job with the given name.
     */
    createJob<T extends JobData = JobData>(name: string): Job<T> {
        const job = new Job<T>(this, name);
        this.jobs.push(job);
        return job;
    }

    /**
     * Get the pg-boss instance (throws if not started).
     */
    getInstance(): PgBoss {
        if (!this.instance) {
            throw new Error('PgBoss not started. Call boss.start() first.');
        }
        return this.instance;
    }

    /**
     * Start PgBoss with the database connection.
     */
    async start(): Promise<void> {
        if (this.instance) {
            return;
        }

        const connectionString = buildConnectionString();
        this.instance = new PgBoss({
            connectionString,
            schema: process.env.PG_BOSS_SCHEMA ?? 'pgboss',
        });

        // Handle errors to prevent unhandled error crashes
        this.instance.on('error', error => {
            logger.error({ err: error }, 'PgBoss error');
        });

        await this.instance.start();
    }

    /**
     * Register all created jobs that have handlers.
     */
    async registerAll(): Promise<void> {
        for (const job of this.jobs) {
            try {
                await job.register();
            } catch (error) {
                // Skip jobs without work functions (they might be emit-only)
                if (error instanceof Error && error.message.includes('no work function')) {
                    continue;
                }
                throw error;
            }
        }
    }

    /**
     * Stop PgBoss gracefully.
     */
    async stop(): Promise<void> {
        if (!this.instance) {
            return;
        }

        await this.instance.stop();
        this.instance = null;
    }

    /**
     * Check if PgBoss is started.
     */
    get isStarted(): boolean {
        return this.instance !== null;
    }
}

// ============================================================================
// Connection String Builder
// ============================================================================

function buildConnectionString(): string {
    const explicit = process.env.PG_BOSS_CONNECTION_STRING || process.env.DATABASE_URL;
    if (explicit) {
        return explicit;
    }

    const password = process.env.BIDBEACON_DATABASE_PASSWORD;
    if (!password) {
        throw new Error('BIDBEACON_DATABASE_PASSWORD is required for PgBoss connection');
    }

    // Use same defaults as src/db/index.ts
    const host = process.env.BIDBEACON_DATABASE_HOST || 'postgres';
    const user = process.env.BIDBEACON_DATABASE_USER || 'bidbeacon';
    const port = process.env.BIDBEACON_DATABASE_PORT || '5432';
    const database = process.env.BIDBEACON_DATABASE_NAME || 'bidbeacon';

    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

// ============================================================================
// Singleton Export
// ============================================================================

export const boss = new BossWrapper();

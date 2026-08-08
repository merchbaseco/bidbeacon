import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { events, jobMetrics } from '@/db/schema';
import { formatError, serializeError } from '@/utils/errors';
import { emitEvent } from '@/utils/events';

type JobMetricStatus = 'running' | 'succeeded' | 'failed';
type EventOutcome = 'ok' | 'error';

type JobEventDraft = {
    message?: string | null;
    outcome?: EventOutcome;
    accountId?: string | null;
    countryCode?: string | null;
    badges?: string[] | null;
    payload?: Record<string, unknown> | null;
};

interface StartJobMetricsOptions {
    jobName: string;
    bossJobId: string;
    input?: Record<string, unknown> | null;
    accountId?: string | null;
    countryCode?: string | null;
}

interface JobMetricHandle {
    id: string;
    jobName: string;
    bossJobId: string;
    startedAt: Date;
}

interface FinishJobMetricsOptions {
    status: JobMetricStatus;
    error?: string | null;
}

interface JobMetricDefaults {
    accountId?: string | null;
    countryCode?: string | null;
}

interface JobEventRecord {
    jobMetricId: string;
    jobName: string;
    accountId: string | null;
    countryCode: string | null;
    outcome: EventOutcome;
    message: string | null;
    badges: string[] | null;
    payload: Record<string, unknown> | null;
}

export class JobMetricsRecorder {
    private statusOverride?: JobMetricStatus;
    private errorMessage?: string | null;
    private errorEvent?: JobEventDraft;
    private readonly events: JobEventDraft[] = [];
    private readonly handle: JobMetricHandle;
    private readonly defaults: JobMetricDefaults;

    constructor(handle: JobMetricHandle, defaults: JobMetricDefaults) {
        this.handle = handle;
        this.defaults = defaults;
    }

    setFinalStatus(status: JobMetricStatus) {
        this.statusOverride = status;
    }

    markFailure(errorMessage: string) {
        this.statusOverride = 'failed';
        this.errorMessage = errorMessage;
    }

    setErrorEvent(event: JobEventDraft) {
        this.errorEvent = event;
    }

    setDefaultErrorEvent(event: JobEventDraft) {
        this.errorEvent ??= event;
    }

    addEvent(event: JobEventDraft) {
        this.events.push(event);
    }

    async finalize(defaultStatus: JobMetricStatus) {
        const status = this.statusOverride ?? defaultStatus;
        await finishJobMetrics(this.handle, {
            status,
            error: this.errorMessage ?? null,
        });

        if (status === 'failed') {
            const errorMessage = this.errorMessage ?? 'Unknown error';
            const errorEvent = this.buildEvent({
                ...this.errorEvent,
                outcome: 'error',
                message: this.errorEvent?.message ?? errorMessage,
            });

            await insertEvents([errorEvent]);
            emitEventsUpdated(errorEvent.accountId);
            return;
        }

        const eventsToInsert = this.events.length > 0 ? this.events : [{ message: null }];
        const records = eventsToInsert.map(event => this.buildEvent(event));

        await insertEvents(records);
        emitEventsUpdated(records[0]?.accountId ?? null);
    }

    private buildEvent(event: JobEventDraft): JobEventRecord {
        return {
            jobMetricId: this.handle.id,
            jobName: this.handle.jobName,
            accountId: event.accountId ?? this.defaults.accountId ?? null,
            countryCode: event.countryCode ?? this.defaults.countryCode ?? null,
            outcome: event.outcome ?? 'ok',
            message: event.message ?? null,
            badges: event.badges ?? null,
            payload: event.payload ?? null,
        };
    }
}

export const withJobMetrics = async <T>(options: StartJobMetricsOptions, handler: (recorder: JobMetricsRecorder) => Promise<T>): Promise<T> => {
    const handle = await startJobMetrics(options);
    const recorder = new JobMetricsRecorder(handle, {
        accountId: options.accountId ?? null,
        countryCode: options.countryCode ?? null,
    });

    try {
        const result = await handler(recorder);
        await recorder.finalize('succeeded');
        return result;
    } catch (error) {
        const message = formatError(error);
        recorder.setDefaultErrorEvent({
            payload: {
                error: serializeError(error),
            },
        });
        recorder.markFailure(message);
        await recorder.finalize('failed');
        throw error;
    }
};

const startJobMetrics = async (options: StartJobMetricsOptions): Promise<JobMetricHandle> => {
    const startedAt = new Date();
    const [row] = await db
        .insert(jobMetrics)
        .values({
            jobName: options.jobName,
            bossJobId: options.bossJobId,
            status: 'running',
            startedAt,
            finishedAt: null,
            error: null,
            input: options.input ?? null,
        })
        .returning();

    if (!row) {
        throw new Error('Failed to start job metrics');
    }

    return {
        id: row.id,
        jobName: row.jobName,
        bossJobId: row.bossJobId,
        startedAt,
    };
};

const finishJobMetrics = async (handle: JobMetricHandle, options: FinishJobMetricsOptions): Promise<void> => {
    const finishedAt = new Date();
    const [row] = await db
        .update(jobMetrics)
        .set({
            status: options.status,
            finishedAt,
            error: options.error ?? null,
        })
        .where(eq(jobMetrics.id, handle.id))
        .returning();

    if (row) {
        emitEvent({
            type: 'job-metrics:updated',
            jobName: row.jobName,
        });
    }
};

const insertEvents = async (records: JobEventRecord[]) => {
    if (records.length === 0) {
        return;
    }

    await db.insert(events).values(
        records.map(record => ({
            jobMetricId: record.jobMetricId,
            jobName: record.jobName,
            accountId: record.accountId,
            countryCode: record.countryCode,
            outcome: record.outcome,
            message: record.message,
            badges: record.badges ?? null,
            payload: record.payload ?? null,
        }))
    );
};

const emitEventsUpdated = (accountId: string | null) => {
    emitEvent({
        type: 'events:updated',
        accountId: accountId ?? null,
    });
};

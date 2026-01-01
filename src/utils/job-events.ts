import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { jobEvents, jobSessions } from '@/db/schema.js';
import { emitEvent, type JobEventsUpdatedEvent } from '@/utils/events.js';

export type JobSessionStatus = 'running' | 'succeeded' | 'failed';

export interface JobSessionContext {
    accountId?: string | null;
    countryCode?: string | null;
    datasetId?: string | null;
    entityType?: string | null;
    aggregation?: string | null;
    bucketDate?: string | Date | null;
    bucketStart?: Date | null;
}

export interface StartJobSessionOptions {
    jobName: string;
    bossJobId: string;
    context?: JobSessionContext;
    metadata?: Record<string, unknown> | null;
}

export interface JobSessionUpdate {
    context?: JobSessionContext;
    metadata?: Record<string, unknown> | null;
    recordsProcessed?: number | null;
    recordsFailed?: number | null;
}

export interface RecordJobEventInput {
    eventType: string;
    message?: string;
    detail?: string;
    stage?: string;
    status?: string;
    durationMs?: number;
    rowCount?: number;
    retryCount?: number;
    apiName?: string;
    context?: JobSessionContext;
    metadata?: Record<string, unknown> | null;
}

interface JobSessionHandle {
    id: string;
    jobName: string;
    bossJobId: string;
    startedAt: Date;
    context: JobSessionContext;
}

interface FinishJobSessionOptions {
    status: JobSessionStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    recordsProcessed?: number | null;
    recordsFailed?: number | null;
    metadata?: Record<string, unknown> | null;
    context?: JobSessionContext;
}

export class JobSessionRecorder {
    private finishFields: Partial<FinishJobSessionOptions> = {};
    private statusOverride?: JobSessionStatus;
    private currentContext: JobSessionContext;

    constructor(private readonly handle: JobSessionHandle) {
        this.currentContext = { ...handle.context };
    }

    getContext(): JobSessionContext {
        return { ...this.currentContext };
    }

    setFinalStatus(status: JobSessionStatus) {
        this.statusOverride = status;
    }

    setFinalFields(fields: Partial<FinishJobSessionOptions>) {
        this.finishFields = {
            ...this.finishFields,
            ...fields,
        };
    }

    markFailure(errorMessage: string, errorCode?: string) {
        this.setFinalStatus('failed');
        this.setFinalFields({
            errorMessage,
            errorCode: errorCode ?? this.finishFields.errorCode,
        });
    }

    async updateSession(updates: JobSessionUpdate) {
        const values: Record<string, unknown> = {};
        if (updates.context) {
            const normalized = normalizeContext(updates.context);
            Object.assign(values, normalized);
            this.currentContext = {
                ...this.currentContext,
                ...updates.context,
            };
        }
        if (updates.metadata !== undefined) {
            values.metadata = updates.metadata;
        }
        if (updates.recordsProcessed !== undefined) {
            values.recordsProcessed = updates.recordsProcessed;
        }
        if (updates.recordsFailed !== undefined) {
            values.recordsFailed = updates.recordsFailed;
        }

        if (Object.keys(values).length === 0) {
            return;
        }

        await db.update(jobSessions).set(values).where(eq(jobSessions.id, this.handle.id));
    }

    async event(input: RecordJobEventInput) {
        await insertJobEvent(this.handle, {
            ...input,
            context: input.context ?? this.currentContext,
        });
    }

    async finalize(defaultStatus: JobSessionStatus, fallbackError?: string) {
        const status = this.statusOverride ?? defaultStatus;
        const finishFields: FinishJobSessionOptions = {
            status,
            ...this.finishFields,
        };

        if (fallbackError && finishFields.errorMessage === undefined) {
            finishFields.errorMessage = fallbackError;
        }

        await finishJobSession(this.handle, finishFields);
    }
}

export async function withJobSession<T>(options: StartJobSessionOptions, handler: (recorder: JobSessionRecorder) => Promise<T>): Promise<T> {
    const handle = await startJobSession(options);
    await insertJobEvent(handle, {
        eventType: 'session',
        message: 'job:started',
        status: 'running',
        metadata: {
            sessionState: 'started',
        },
        context: handle.context,
    });

    const recorder = new JobSessionRecorder(handle);

    try {
        const result = await handler(recorder);
        await recorder.finalize('succeeded');
        const durationMs = Date.now() - handle.startedAt.getTime();
        await insertJobEvent(handle, {
            eventType: 'session',
            message: 'job:succeeded',
            status: 'succeeded',
            durationMs,
            metadata: {
                sessionState: 'succeeded',
            },
            context: recorder.getContext(),
        });
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recorder.setFinalStatus('failed');
        recorder.setFinalFields({ errorMessage: message });
        await recorder.finalize('failed', message);
        const durationMs = Date.now() - handle.startedAt.getTime();
        await insertJobEvent(handle, {
            eventType: 'session',
            message: 'job:failed',
            status: 'failed',
            durationMs,
            metadata: {
                sessionState: 'failed',
            },
            context: recorder.getContext(),
        });
        throw error;
    }
}

async function startJobSession(options: StartJobSessionOptions): Promise<JobSessionHandle> {
    const startedAt = new Date();
    const [row] = await db
        .insert(jobSessions)
        .values({
            jobName: options.jobName,
            bossJobId: options.bossJobId,
            status: 'running',
            startedAt,
            metadata: options.metadata ?? null,
            ...normalizeContext(options.context),
        })
        .returning();

    return {
        id: row.id,
        jobName: row.jobName,
        bossJobId: row.bossJobId,
        startedAt,
        context: options.context ?? {},
    };
}

async function finishJobSession(handle: JobSessionHandle, options: FinishJobSessionOptions): Promise<void> {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - handle.startedAt.getTime();
    const values: Record<string, unknown> = {
        status: options.status,
        finishedAt,
        durationMs,
    };

    if (options.errorCode !== undefined) values.errorCode = options.errorCode;
    if (options.errorMessage !== undefined) values.errorMessage = options.errorMessage;
    if (options.recordsProcessed !== undefined) values.recordsProcessed = options.recordsProcessed;
    if (options.recordsFailed !== undefined) values.recordsFailed = options.recordsFailed;
    if (options.metadata !== undefined) values.metadata = options.metadata;
    if (options.context) Object.assign(values, normalizeContext(options.context));

    await db.update(jobSessions).set(values).where(eq(jobSessions.id, handle.id));
}

async function insertJobEvent(handle: JobSessionHandle, input: RecordJobEventInput) {
    const normalizedContext = normalizeContext(input.context);
    const occurredAt = new Date();

    const [event] = await db
        .insert(jobEvents)
        .values({
            sessionId: handle.id,
            jobName: handle.jobName,
            bossJobId: handle.bossJobId,
            occurredAt,
            eventType: input.eventType,
            headline: input.message ?? input.eventType,
            detail: input.detail ?? null,
            stage: input.stage ?? null,
            status: input.status ?? null,
            durationMs: input.durationMs ?? null,
            rowCount: input.rowCount ?? null,
            retryCount: input.retryCount ?? null,
            apiName: input.apiName ?? null,
            metadata: input.metadata ?? null,
            ...normalizedContext,
        })
        .returning();

    emitEvent({
        type: 'job-events:updated',
        jobName: handle.jobName,
        event: serializeJobEvent(event),
    });
}

function normalizeContext(context?: JobSessionContext): Record<string, unknown> {
    if (!context) {
        return {};
    }

    const values: Record<string, unknown> = {};

    if (context.accountId !== undefined) {
        values.accountId = context.accountId ?? null;
    }
    if (context.countryCode !== undefined) {
        values.countryCode = context.countryCode ?? null;
    }
    if (context.datasetId !== undefined) {
        values.datasetId = context.datasetId ?? null;
    }
    if (context.entityType !== undefined) {
        values.entityType = context.entityType ?? null;
    }
    if (context.aggregation !== undefined) {
        values.aggregation = context.aggregation ?? null;
    }
    if (context.bucketDate !== undefined) {
        values.bucketDate = context.bucketDate === null ? null : toDate(context.bucketDate);
    }
    if (context.bucketStart !== undefined) {
        values.bucketStart = context.bucketStart ?? null;
    }

    return values;
}

function toDate(value: string | Date): Date | null {
    const candidate = value instanceof Date ? value : new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function serializeJobEvent(event: typeof jobEvents.$inferSelect): JobEventsUpdatedEvent['event'] {
    return {
        id: event.id,
        sessionId: event.sessionId,
        bossJobId: event.bossJobId,
        occurredAt: event.occurredAt.toISOString(),
        eventType: event.eventType,
        message: event.headline,
        detail: event.detail,
        stage: event.stage,
        status: event.status,
        durationMs: event.durationMs,
        rowCount: event.rowCount,
        retryCount: event.retryCount,
        apiName: event.apiName,
        accountId: event.accountId,
        countryCode: event.countryCode,
        datasetId: event.datasetId,
        entityType: event.entityType,
        aggregation: event.aggregation,
        bucketDate: event.bucketDate ? formatDateColumn(event.bucketDate) : null,
        bucketStart: event.bucketStart ? event.bucketStart.toISOString() : null,
        metadata: (event.metadata ?? null) as Record<string, unknown> | null,
    };
}

function formatDateColumn(value: Date | string) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

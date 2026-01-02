import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { jobSessions } from '@/db/schema';
import { emitEvent, type JobSessionsUpdatedEvent } from '@/utils/events';

export type JobSessionStatus = 'running' | 'succeeded' | 'failed';

export type JobSessionAction = {
    type: string;
    at?: string | Date;
} & Record<string, unknown>;

export interface StartJobSessionOptions {
    jobName: string;
    bossJobId: string;
    input?: Record<string, unknown> | null;
}

interface JobSessionHandle {
    id: string;
    jobName: string;
    bossJobId: string;
    startedAt: Date;
}

interface FinishJobSessionOptions {
    status: JobSessionStatus;
    error?: string | null;
}

export class JobSessionRecorder {
    private statusOverride?: JobSessionStatus;
    private errorMessage?: string | null;

    constructor(private readonly handle: JobSessionHandle) {}

    setFinalStatus(status: JobSessionStatus) {
        this.statusOverride = status;
    }

    markFailure(errorMessage: string) {
        this.statusOverride = 'failed';
        this.errorMessage = errorMessage;
    }

    async addAction(action: JobSessionAction) {
        const normalized = normalizeAction(action);
        const serialized = JSON.stringify([normalized]);

        const [row] = await db
            .update(jobSessions)
            .set({
                actions: sql`coalesce(${jobSessions.actions}, '[]'::jsonb) || ${serialized}::jsonb`,
            })
            .where(eq(jobSessions.id, this.handle.id))
            .returning();

        if (row) {
            emitJobSessionUpdated(row);
        }
    }

    async finalize(defaultStatus: JobSessionStatus) {
        const status = this.statusOverride ?? defaultStatus;
        await finishJobSession(this.handle, {
            status,
            error: this.errorMessage ?? null,
        });
    }
}

export const withJobSession = async <T>(options: StartJobSessionOptions, handler: (recorder: JobSessionRecorder) => Promise<T>): Promise<T> => {
    const handle = await startJobSession(options);
    const recorder = new JobSessionRecorder(handle);

    try {
        const result = await handler(recorder);
        await recorder.finalize('succeeded');
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recorder.markFailure(message);
        await recorder.finalize('failed');
        throw error;
    }
};

const startJobSession = async (options: StartJobSessionOptions): Promise<JobSessionHandle> => {
    const startedAt = new Date();
    const [row] = await db
        .insert(jobSessions)
        .values({
            jobName: options.jobName,
            bossJobId: options.bossJobId,
            status: 'running',
            startedAt,
            finishedAt: null,
            error: null,
            input: options.input ?? null,
            actions: [],
        })
        .returning();

    if (!row) {
        throw new Error('Failed to start job session');
    }

    emitJobSessionUpdated(row);

    return {
        id: row.id,
        jobName: row.jobName,
        bossJobId: row.bossJobId,
        startedAt,
    };
};

const finishJobSession = async (handle: JobSessionHandle, options: FinishJobSessionOptions): Promise<void> => {
    const finishedAt = new Date();
    const [row] = await db
        .update(jobSessions)
        .set({
            status: options.status,
            finishedAt,
            error: options.error ?? null,
        })
        .where(eq(jobSessions.id, handle.id))
        .returning();

    if (row) {
        emitJobSessionUpdated(row);
    }
};

const emitJobSessionUpdated = (row: typeof jobSessions.$inferSelect) => {
    emitEvent({
        type: 'job-sessions:updated',
        jobName: row.jobName,
        session: serializeJobSession(row),
    });
};

const normalizeAction = (action: JobSessionAction): JobSessionAction => {
    const actionAt = formatActionTimestamp(action.at);
    const { at, ...rest } = action;
    return {
        ...rest,
        at: actionAt,
    };
};

const formatActionTimestamp = (value?: string | Date): string => {
    if (!value) {
        return new Date().toISOString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value;
};

const serializeJobSession = (session: typeof jobSessions.$inferSelect): JobSessionsUpdatedEvent['session'] => ({
    id: session.id,
    jobName: session.jobName,
    bossJobId: session.bossJobId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
    error: session.error ?? null,
    input: (session.input ?? null) as Record<string, unknown> | null,
    actions: (session.actions ?? []) as JobSessionAction[],
});

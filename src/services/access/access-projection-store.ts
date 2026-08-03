import type { AccessProjection, AccessProjectionEvent, AccessProjectionIdentityState, AccessProjectionStore, ClerkIdentity } from '@merchbaseco/access';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '@/db/index';
import { accessProjection, accessProjectionEvent } from '@/db/schema';

export const createAccessProjectionStore = (database: Database): AccessProjectionStore => ({
    apply: event => applyProjectionEvent(database, event),
    findByIdentity: identity => findByIdentity(database, identity),
    findByMerchbaseUserId: merchbaseUserId => findByMerchbaseUserId(database, merchbaseUserId),
});

const applyProjectionEvent = async (database: Database, event: AccessProjectionEvent) => {
    const identity = getEventIdentity(event);
    const sourceUpdatedAt = getSourceUpdatedAt(event);

    await database.transaction(async transaction => {
        const accepted = await transaction
            .insert(accessProjectionEvent)
            .values({
                eventId: event.eventId,
                issuer: identity.issuer,
                subject: identity.subject,
                sourceUpdatedAt,
            })
            .onConflictDoNothing({ target: accessProjectionEvent.eventId })
            .returning({ eventId: accessProjectionEvent.eventId });

        if (!accepted[0]) {
            return;
        }

        const projection = event.type === 'upsert' ? event.projection : null;
        await transaction
            .insert(accessProjection)
            .values({
                access: projection?.access ?? null,
                accessValidUntil: projection?.accessValidUntil ?? null,
                issuer: identity.issuer,
                lastEventId: event.eventId,
                merchbaseUserId: projection?.merchbaseUserId ?? null,
                sourceUpdatedAt,
                state: projection ? 'active' : 'tombstone',
                subject: identity.subject,
            })
            .onConflictDoUpdate({
                target: [accessProjection.issuer, accessProjection.subject],
                set: {
                    access: projection?.access ?? null,
                    accessValidUntil: projection?.accessValidUntil ?? null,
                    lastEventId: event.eventId,
                    merchbaseUserId: projection?.merchbaseUserId ?? null,
                    sourceUpdatedAt,
                    state: projection ? 'active' : 'tombstone',
                    updatedAt: new Date(),
                },
                where: sql`${accessProjection.sourceUpdatedAt} <= excluded.source_updated_at`,
            });
    });
};

const findByIdentity = async (database: Database, identity: ClerkIdentity): Promise<AccessProjectionIdentityState> => {
    const rows = await database
        .select({
            access: accessProjection.access,
            accessValidUntil: accessProjection.accessValidUntil,
            issuer: accessProjection.issuer,
            merchbaseUserId: accessProjection.merchbaseUserId,
            sourceUpdatedAt: accessProjection.sourceUpdatedAt,
            state: accessProjection.state,
            subject: accessProjection.subject,
        })
        .from(accessProjection)
        .where(and(eq(accessProjection.issuer, identity.issuer), eq(accessProjection.subject, identity.subject)))
        .limit(1);

    const row = rows[0];
    if (!row) {
        return { type: 'missing' };
    }
    if (row.state === 'tombstone') {
        return { type: 'tombstone' };
    }

    return {
        projection: toProjection(row),
        type: 'active',
    };
};

const findByMerchbaseUserId = async (database: Database, merchbaseUserId: string): Promise<AccessProjection | null> => {
    const rows = await database
        .select({
            access: accessProjection.access,
            accessValidUntil: accessProjection.accessValidUntil,
            issuer: accessProjection.issuer,
            merchbaseUserId: accessProjection.merchbaseUserId,
            sourceUpdatedAt: accessProjection.sourceUpdatedAt,
            state: accessProjection.state,
            subject: accessProjection.subject,
        })
        .from(accessProjection)
        .where(and(eq(accessProjection.merchbaseUserId, merchbaseUserId), eq(accessProjection.state, 'active')))
        .orderBy(desc(accessProjection.sourceUpdatedAt))
        .limit(1);

    const row = rows[0];
    return row ? toProjection(row) : null;
};

const toProjection = (row: {
    access: 'granted' | 'not_granted' | null;
    accessValidUntil: number | null;
    issuer: string;
    merchbaseUserId: string | null;
    sourceUpdatedAt: number;
    state: 'active' | 'tombstone';
    subject: string;
}): AccessProjection => {
    if (!(row.merchbaseUserId && row.access) || row.state !== 'active') {
        throw new Error('Active access projection is missing required values.');
    }

    return {
        access: row.access,
        accessValidUntil: row.accessValidUntil,
        issuer: row.issuer,
        merchbaseUserId: row.merchbaseUserId,
        sourceUpdatedAt: row.sourceUpdatedAt,
        subject: row.subject,
    };
};

const getEventIdentity = (event: AccessProjectionEvent): ClerkIdentity => (event.type === 'upsert' ? event.projection : event.identity);

const getSourceUpdatedAt = (event: AccessProjectionEvent) => (event.type === 'upsert' ? event.projection.sourceUpdatedAt : event.sourceUpdatedAt);

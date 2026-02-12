import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { amsCmTargets, campaign, target } from '@/db/schema.js';
import { recordEntityChange } from '@/lib/entity-change-history.js';
import { trackAmsEvent } from '@/utils/ams-metrics.js';
import { createContextLogger } from '@/utils/logger';
import { targetSchema } from '../schemas.js';
import { resolveAmsDeliveryStatus, resolveAmsState } from './ams-state';

/**
 * Handle Campaign Management Target events
 */
export async function handleTargets(payload: unknown): Promise<void> {
    return trackAmsEvent('target', async () => {
        // Validate payload with Zod (AMS uses snake_case)
        const validationResult = targetSchema.safeParse(payload);
        if (!validationResult.success) {
            const datasetId = typeof payload === 'object' && payload !== null && 'dataset_id' in payload ? String(payload.dataset_id) : 'unknown';
            const logger = createContextLogger({ component: 'handler', handler: 'targets', datasetId });
            logger.error({ err: validationResult.error, validationErrors: validationResult.error.format() }, 'Validation failed');
            throw new Error(`Invalid targets payload: ${validationResult.error.message}`);
        }

        const data = validationResult.data;

        // Map from snake_case (AMS) to camelCase (Drizzle schema)
        const record = {
            datasetId: data.dataset_id,
            targetId: data.target_id,
            adGroupId: data.ad_group_id,
            campaignId: data.campaign_id,
            adProduct: data.ad_product,
            marketplaceScope: data.marketplace_scope ?? null,
            marketplaces: data.marketplaces ?? null, // Array stored as jsonb
            negative: data.negative ?? null,
            targetLevel: data.target_level ?? null,
            creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
            lastUpdatedDateTime: data.last_updated_date_time ? new Date(data.last_updated_date_time) : null,
            targetType: data.target_type ?? null,
            // Nested objects stored as jsonb
            state: data.state ?? null,
            status: data.status ?? null,
            bid: data.bid ?? null,
            targetDetails: data.target_details ?? null,
            tags: data.tags ?? null, // Array of { key, value } objects
        };

        // Upsert with idempotency using targetId
        await db
            .insert(amsCmTargets)
            .values(record)
            .onConflictDoUpdate({
                target: [amsCmTargets.targetId],
                set: record,
            });

        await updateTargetFromAms(data);
    });
}

const updateTargetFromAms = async (data: { target_id: string; last_updated_date_time?: string; state?: unknown; status?: unknown; bid?: unknown }) => {
    const lastUpdated = data.last_updated_date_time ? new Date(data.last_updated_date_time) : null;
    if (!lastUpdated) {
        return;
    }

    const [current] = await db
        .select({
            targetId: target.targetId,
            accountId: campaign.accountId,
            countryCode: campaign.countryCode,
            state: target.state,
            bidAmount: target.bidAmount,
            lastUpdatedDateTime: target.lastUpdatedDateTime,
        })
        .from(target)
        .leftJoin(campaign, eq(target.campaignId, campaign.campaignId))
        .where(and(eq(target.targetId, data.target_id), or(isNull(target.lastUpdatedDateTime), lte(target.lastUpdatedDateTime, lastUpdated))))
        .limit(1);

    if (!current) {
        return;
    }

    const updates: Record<string, unknown> = {
        lastUpdatedDateTime: lastUpdated,
    };

    const state = resolveAmsState(data.state);
    if (state) {
        updates.state = state;
    }

    const deliveryStatus = resolveAmsDeliveryStatus(data.status);
    if (deliveryStatus) {
        updates.deliveryStatus = deliveryStatus;
    }

    const bidAmount = resolveTargetBid(data.bid);
    if (bidAmount !== null) {
        updates.bidAmount = toMoneyString(bidAmount);
    }

    if (Object.keys(updates).length === 1) {
        return;
    }

    const [updated] = await db
        .update(target)
        .set(updates)
        .where(and(eq(target.targetId, data.target_id), or(isNull(target.lastUpdatedDateTime), lte(target.lastUpdatedDateTime, lastUpdated))))
        .returning({ targetId: target.targetId });

    if (!updated) {
        return;
    }

    const nextState = typeof updates.state === 'string' ? updates.state : null;
    if (current.accountId && nextState && current.state !== nextState) {
        await recordEntityChange({
            accountId: current.accountId,
            countryCode: current.countryCode,
            entityType: 'target',
            entityId: current.targetId,
            eventType: 'state_change',
            fieldName: 'state',
            previousValue: current.state,
            newValue: nextState,
            changedAt: lastUpdated,
            source: 'ams',
            rawPayload: data,
        });
    }

    if (current.accountId && bidAmount !== null) {
        const previousBid = parseNumeric(current.bidAmount);
        if (previousBid !== bidAmount) {
            await recordEntityChange({
                accountId: current.accountId,
                countryCode: current.countryCode,
                entityType: 'target',
                entityId: current.targetId,
                eventType: 'bid_change',
                fieldName: 'bidAmount',
                previousValue: previousBid,
                newValue: bidAmount,
                changedAt: lastUpdated,
                source: 'ams',
                rawPayload: data,
            });
        }
    }
};

const parseNumeric = (value: string | number | null) => {
    if (value === null || value === undefined) {
        return null;
    }
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

const resolveTargetBid = (bid: unknown): number | null => {
    if (!bid || typeof bid !== 'object') {
        return null;
    }

    const bidContainer = (bid as { bid?: unknown }).bid;
    if (typeof bidContainer === 'number' && Number.isFinite(bidContainer)) {
        return bidContainer;
    }

    if (!bidContainer || typeof bidContainer !== 'object') {
        return null;
    }

    const nestedBid = (bidContainer as { bid?: unknown }).bid;
    return typeof nestedBid === 'number' && Number.isFinite(nestedBid) ? nestedBid : null;
};

const toMoneyString = (value: number) => value.toFixed(2);

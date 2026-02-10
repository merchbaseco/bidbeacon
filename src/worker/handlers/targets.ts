import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { amsCmTargets, target } from '@/db/schema.js';
import { trackAmsEvent } from '@/utils/ams-metrics.js';
import { createContextLogger } from '@/utils/logger';
import { resolveAmsDeliveryStatus, resolveAmsState } from './ams-state';
import { targetSchema } from '../schemas.js';

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

const updateTargetFromAms = async (data: { target_id: string; last_updated_date_time?: string; state?: unknown; status?: unknown }) => {
    const lastUpdated = data.last_updated_date_time ? new Date(data.last_updated_date_time) : null;
    if (!lastUpdated) {
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

    if (Object.keys(updates).length === 1) {
        return;
    }

    await db
        .update(target)
        .set(updates)
        .where(
            and(eq(target.targetId, data.target_id), or(isNull(target.lastUpdatedDateTime), lte(target.lastUpdatedDateTime, lastUpdated)))
        );
};

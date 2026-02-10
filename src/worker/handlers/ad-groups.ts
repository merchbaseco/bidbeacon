import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { adGroup, amsCmAdgroups } from '@/db/schema';
import { trackAmsEvent } from '@/utils/ams-metrics';
import { createContextLogger } from '@/utils/logger';
import { adGroupSchema } from '../schemas';
import { resolveAmsDeliveryStatus, resolveAmsState } from './ams-state';

/**
 * Handle Campaign Management AdGroup events
 */
export async function handleAdGroups(payload: unknown): Promise<void> {
    return trackAmsEvent('adGroup', async () => {
        // Validate payload with Zod (AMS uses snake_case)
        const validationResult = adGroupSchema.safeParse(payload);
        if (!validationResult.success) {
            const datasetId = typeof payload === 'object' && payload !== null && 'dataset_id' in payload ? String(payload.dataset_id) : 'unknown';
            const logger = createContextLogger({ component: 'handler', handler: 'adGroups', datasetId });
            logger.error({ err: validationResult.error, validationErrors: validationResult.error.format() }, 'Validation failed');
            throw new Error(`Invalid adgroups payload: ${validationResult.error.message}`);
        }

        const data = validationResult.data;

        // Map from snake_case (AMS) to camelCase (Drizzle schema)
        const record = {
            datasetId: data.dataset_id,
            adGroupId: data.ad_group_id,
            campaignId: data.campaign_id,
            adProduct: data.ad_product,
            marketplaceScope: data.marketplace_scope ?? null,
            marketplaces: data.marketplaces ?? null, // Array stored as jsonb
            name: data.name,
            creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
            lastUpdatedDateTime: data.last_updated_date_time ? new Date(data.last_updated_date_time) : null,
            startDateTime: data.start_date_time ? new Date(data.start_date_time) : null,
            endDateTime: data.end_date_time ? new Date(data.end_date_time) : null,
            inventoryType: data.inventory_type ?? null,
            creativeRotationType: data.creative_rotation_type ?? null,
            purchaseOrderNumber: data.purchase_order_number ?? null,
            advertisedProductCategoryIds: data.advertised_product_category_ids ?? null, // Array stored as jsonb
            // Nested objects stored as jsonb
            state: data.state ?? null,
            status: data.status ?? null,
            bid: data.bid ?? null,
            optimization: data.optimization ?? null,
            budgets: data.budgets ?? null,
            pacing: data.pacing ?? null,
            frequencies: data.frequencies ?? null,
            targetingSettings: data.targeting_settings ?? null,
            tags: data.tags ?? null, // Array of { key, value } objects
            fees: data.fees ?? null,
        };

        // Upsert with idempotency using adGroupId + campaignId
        await db
            .insert(amsCmAdgroups)
            .values(record)
            .onConflictDoUpdate({
                target: [amsCmAdgroups.adGroupId, amsCmAdgroups.campaignId],
                set: record,
            });

        await updateAdGroupFromAms(data);
    });
}

const updateAdGroupFromAms = async (data: { ad_group_id: string; last_updated_date_time?: string; state?: unknown; status?: unknown }) => {
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
        .update(adGroup)
        .set(updates)
        .where(and(eq(adGroup.adGroupId, data.ad_group_id), or(isNull(adGroup.lastUpdatedDateTime), lte(adGroup.lastUpdatedDateTime, lastUpdated))));
};

import { db } from '@/db/index.js';
import { amsCmAdgroups } from '@/db/schema.js';
import { adGroupSchema } from '../schemas.js';

/**
 * Handle Campaign Management AdGroup events
 */
export async function handleAdGroups(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = adGroupSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';
        console.error(
            `[handleAdGroups] Validation failed for datasetId ${datasetId}:`,
            validationResult.error.format()
        );
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
        lastUpdatedDateTime: data.last_updated_date_time
            ? new Date(data.last_updated_date_time)
            : null,
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
}

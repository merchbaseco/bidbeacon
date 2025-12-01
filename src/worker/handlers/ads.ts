import { db } from '@/db/index.js';
import { ams_cm_ads } from '@/db/schema.js';
import { adSchema } from '../schemas.js';

/**
 * Handle Campaign Management Ad events
 */
export async function handleAds(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = adSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';
        console.error(
            `[handleAds] Validation failed for datasetId ${datasetId}:`,
            validationResult.error.format()
        );
        throw new Error(`Invalid ads payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map from snake_case (AMS) to camelCase (Drizzle schema)
    const record = {
        datasetId: data.dataset_id,
        adId: data.ad_id,
        adGroupId: data.ad_group_id,
        campaignId: data.campaign_id, // Read-only parent campaign
        adProduct: data.ad_product,
        marketplaceScope: data.marketplace_scope ?? null,
        marketplaces: data.marketplaces ?? null, // Array stored as jsonb
        name: data.name,
        creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
        lastUpdatedDateTime: data.last_updated_date_time
            ? new Date(data.last_updated_date_time)
            : null,
        adType: data.ad_type ?? null,
        // Nested objects stored as jsonb
        state: data.state ?? null,
        status: data.status ?? null,
        creative: data.creative ?? null,
        tags: data.tags ?? null, // Array of { key, value } objects
    };

    // Upsert with idempotency using adId
    await db.insert(ams_cm_ads).values(record).onConflictDoUpdate({
        target: [ams_cm_ads.adId],
        set: record,
    });
}

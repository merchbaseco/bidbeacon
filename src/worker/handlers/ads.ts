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
        adId: data.ad_id,
        adGroupId: data.ad_group_id ?? null,
        campaignId: data.campaign_id ?? null,
        adProduct: data.ad_product ?? null,
        name: data.name ?? null,
        state: data.state ?? null,
        deliveryStatus: data.delivery_status ?? null,
        deliveryReasons: data.delivery_reasons ?? null,
        creativeType: data.creative_type ?? null,
        creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
        lastUpdatedDateTime: data.last_updated_date_time
            ? new Date(data.last_updated_date_time)
            : null,
        servingStatus: data.serving_status ?? null,
        servingReasons: data.serving_reasons ?? null,
    };

    // Upsert with idempotency using adId
    await db.insert(ams_cm_ads).values(record).onConflictDoUpdate({
        target: ams_cm_ads.adId,
        set: record,
    });
}

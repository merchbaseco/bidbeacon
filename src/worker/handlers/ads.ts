import { db } from '@/db/index.js';
import { ams_cm_ads } from '@/db/schema.js';
import { adSchema } from '../schemas.js';

/**
 * Handle Campaign Management Ad events
 */
export async function handleAds(payload: unknown): Promise<void> {
    // Validate payload with Zod
    const validationResult = adSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'datasetId' in payload
            ? String(payload.datasetId)
            : 'unknown';
        console.error(`[handleAds] Validation failed for datasetId ${datasetId}:`, validationResult.error.format());
        throw new Error(`Invalid ads payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map to Drizzle schema format
    const record = {
        adId: data.adId,
        adGroupId: data.adGroupId ?? null,
        campaignId: data.campaignId ?? null,
        adProduct: data.adProduct ?? null,
        name: data.name ?? null,
        state: data.state ?? null,
        deliveryStatus: data.deliveryStatus ?? null,
        deliveryReasons: data.deliveryReasons ?? null,
        creativeType: data.creativeType ?? null,
        creationDateTime: data.creationDateTime ? new Date(data.creationDateTime) : null,
        lastUpdatedDateTime: data.lastUpdatedDateTime ? new Date(data.lastUpdatedDateTime) : null,
        servingStatus: data.servingStatus ?? null,
        servingReasons: data.servingReasons ?? null,
    };

    // Upsert with idempotency using adId
    await db
        .insert(ams_cm_ads)
        .values(record)
        .onConflictDoUpdate({
            target: ams_cm_ads.adId,
            set: record,
        });
}


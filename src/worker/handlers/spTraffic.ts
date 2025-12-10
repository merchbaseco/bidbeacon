import { db } from '@/db/index.js';
import { amsSpTraffic } from '@/db/schema.js';
import { spTrafficSchema } from '../schemas.js';

/**
 * Handle Sponsored Products Traffic events
 */
export async function handleSpTraffic(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = spTrafficSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';
        console.error(
            `[handleSpTraffic] Validation failed for datasetId ${datasetId}:`,
            validationResult.error.format()
        );
        throw new Error(`Invalid sp-traffic payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map from snake_case (AMS) to camelCase (Drizzle schema)
    const record = {
        idempotencyId: data.idempotency_id,
        datasetId: data.dataset_id,
        marketplaceId: data.marketplace_id,
        currency: data.currency,
        advertiserId: data.advertiser_id,
        campaignId: data.campaign_id,
        adGroupId: data.ad_group_id,
        adId: data.ad_id,
        keywordId: data.keyword_id,
        keywordText: data.keyword_text,
        matchType: data.match_type,
        placement: data.placement,
        timeWindowStart: new Date(data.time_window_start),
        clicks: data.clicks,
        impressions: data.impressions,
        cost: data.cost,
    };

    // Upsert with idempotency
    await db.insert(amsSpTraffic).values(record).onConflictDoUpdate({
        target: amsSpTraffic.idempotencyId,
        set: record,
    });
}

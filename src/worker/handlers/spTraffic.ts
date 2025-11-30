import { db } from '@/db/index.js';
import { ams_sp_traffic } from '@/db/schema.js';
import { spTrafficSchema } from '../schemas.js';

/**
 * Handle Sponsored Products Traffic events
 */
export async function handleSpTraffic(payload: unknown): Promise<void> {
    // Validate payload with Zod
    const validationResult = spTrafficSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'datasetId' in payload
            ? String(payload.datasetId)
            : 'unknown';
        console.error(`[handleSpTraffic] Validation failed for datasetId ${datasetId}:`, validationResult.error.format());
        throw new Error(`Invalid sp-traffic payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map to Drizzle schema format
    const record = {
        idempotencyId: data.idempotencyId,
        datasetId: data.datasetId,
        marketplaceId: data.marketplaceId,
        currency: data.currency,
        advertiserId: data.advertiserId,
        campaignId: data.campaignId,
        adGroupId: data.adGroupId,
        adId: data.adId,
        keywordId: data.keywordId,
        keywordText: data.keywordText,
        matchType: data.matchType,
        placement: data.placement,
        timeWindowStart: new Date(data.timeWindowStart),
        clicks: data.clicks,
        impressions: data.impressions,
        cost: data.cost,
    };

    // Upsert with idempotency
    await db
        .insert(ams_sp_traffic)
        .values(record)
        .onConflictDoUpdate({
            target: ams_sp_traffic.idempotencyId,
            set: record,
        });
}


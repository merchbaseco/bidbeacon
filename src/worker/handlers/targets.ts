import { db } from '@/db/index.js';
import { ams_cm_targets } from '@/db/schema.js';
import { targetSchema } from '../schemas.js';

/**
 * Handle Campaign Management Target events
 */
export async function handleTargets(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = targetSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';
        console.error(
            `[handleTargets] Validation failed for datasetId ${datasetId}:`,
            validationResult.error.format()
        );
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
        lastUpdatedDateTime: data.last_updated_date_time
            ? new Date(data.last_updated_date_time)
            : null,
        targetType: data.target_type ?? null,
        // Nested objects stored as jsonb
        state: data.state ?? null,
        status: data.status ?? null,
        bid: data.bid ?? null,
        targetDetails: data.target_details ?? null,
        tags: data.tags ?? null, // Array of { key, value } objects
    };

    // Upsert with idempotency using targetId
    await db.insert(ams_cm_targets).values(record).onConflictDoUpdate({
        target: [ams_cm_targets.targetId],
        set: record,
    });
}

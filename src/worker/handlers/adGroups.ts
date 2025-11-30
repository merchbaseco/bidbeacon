import { db } from '@/db/index.js';
import { ams_cm_adgroups } from '@/db/schema.js';
import { adGroupSchema } from '../schemas.js';

/**
 * Handle Campaign Management AdGroup events
 */
export async function handleAdGroups(payload: unknown): Promise<void> {
    // Validate payload with Zod
    const validationResult = adGroupSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'datasetId' in payload
            ? String(payload.datasetId)
            : 'unknown';
        console.error(`[handleAdGroups] Validation failed for datasetId ${datasetId}:`, validationResult.error.format());
        throw new Error(`Invalid adgroups payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map to Drizzle schema format
    const record = {
        adGroupId: data.adGroupId,
        campaignId: data.campaignId,
        adProduct: data.adProduct,
        name: data.name,
        state: data.state,
        deliveryStatus: data.deliveryStatus ?? null,
        deliveryReasons: data.deliveryReasons ?? null,
        creativeType: data.creativeType ?? null,
        creationDateTime: data.creationDateTime ? new Date(data.creationDateTime) : null,
        lastUpdatedDateTime: data.lastUpdatedDateTime ? new Date(data.lastUpdatedDateTime) : null,
        bidDefaultBid: data.bidDefaultBid ?? null,
        bidCurrencyCode: data.bidCurrencyCode ?? null,
        optimizationGoalSettingGoal: data.optimizationGoalSettingGoal ?? null,
        optimizationGoalSettingKpi: data.optimizationGoalSettingKpi ?? null,
    };

    // Upsert with idempotency using adGroupId + campaignId
    await db
        .insert(ams_cm_adgroups)
        .values(record)
        .onConflictDoUpdate({
            target: [ams_cm_adgroups.adGroupId, ams_cm_adgroups.campaignId],
            set: record,
        });
}


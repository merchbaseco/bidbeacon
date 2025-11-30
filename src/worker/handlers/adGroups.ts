import { db } from '@/db/index.js';
import { ams_cm_adgroups } from '@/db/schema.js';
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
        adGroupId: data.ad_group_id,
        campaignId: data.campaign_id,
        adProduct: data.ad_product,
        name: data.name,
        state: data.state,
        deliveryStatus: data.delivery_status ?? null,
        deliveryReasons: data.delivery_reasons ?? null,
        creativeType: data.creative_type ?? null,
        creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
        lastUpdatedDateTime: data.last_updated_date_time
            ? new Date(data.last_updated_date_time)
            : null,
        bidDefaultBid: data.bid_default_bid ?? null,
        bidCurrencyCode: data.bid_currency_code ?? null,
        optimizationGoalSettingGoal: data.optimization_goal_setting_goal ?? null,
        optimizationGoalSettingKpi: data.optimization_goal_setting_kpi ?? null,
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

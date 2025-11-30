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
        targetId: data.target_id,
        adGroupId: data.ad_group_id ?? null,
        campaignId: data.campaign_id ?? null,
        adProduct: data.ad_product ?? null,
        expressionType: data.expression_type ?? null,
        expression: data.expression ?? null,
        state: data.state ?? null,
        startDateTime: data.start_date_time ? new Date(data.start_date_time) : null,
        endDateTime: data.end_date_time ? new Date(data.end_date_time) : null,
        creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
        lastUpdatedDateTime: data.last_updated_date_time
            ? new Date(data.last_updated_date_time)
            : null,
    };

    // Upsert with idempotency using targetId
    await db.insert(ams_cm_targets).values(record).onConflictDoUpdate({
        target: ams_cm_targets.targetId,
        set: record,
    });
}

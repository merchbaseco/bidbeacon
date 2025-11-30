import { db } from '@/db/index.js';
import { ams_cm_targets } from '@/db/schema.js';
import { targetSchema } from '../schemas.js';

/**
 * Handle Campaign Management Target events
 */
export async function handleTargets(payload: unknown): Promise<void> {
    // Validate payload with Zod
    const validationResult = targetSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'datasetId' in payload
            ? String(payload.datasetId)
            : 'unknown';
        console.error(`[handleTargets] Validation failed for datasetId ${datasetId}:`, validationResult.error.format());
        throw new Error(`Invalid targets payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map to Drizzle schema format
    const record = {
        targetId: data.targetId,
        adGroupId: data.adGroupId ?? null,
        campaignId: data.campaignId ?? null,
        adProduct: data.adProduct ?? null,
        expressionType: data.expressionType ?? null,
        expression: data.expression ?? null,
        state: data.state ?? null,
        startDateTime: data.startDateTime ? new Date(data.startDateTime) : null,
        endDateTime: data.endDateTime ? new Date(data.endDateTime) : null,
        creationDateTime: data.creationDateTime ? new Date(data.creationDateTime) : null,
        lastUpdatedDateTime: data.lastUpdatedDateTime ? new Date(data.lastUpdatedDateTime) : null,
    };

    // Upsert with idempotency using targetId
    await db
        .insert(ams_cm_targets)
        .values(record)
        .onConflictDoUpdate({
            target: ams_cm_targets.targetId,
            set: record,
        });
}


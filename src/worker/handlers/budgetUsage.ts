import { db } from '@/db/index.js';
import { ams_budget_usage } from '@/db/schema.js';
import { budgetUsageSchema } from '../schemas.js';

/**
 * Handle Budget Usage events
 */
export async function handleBudgetUsage(payload: unknown): Promise<void> {
    // Validate payload with Zod
    const validationResult = budgetUsageSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'datasetId' in payload
            ? String(payload.datasetId)
            : 'unknown';
        console.error(`[handleBudgetUsage] Validation failed for datasetId ${datasetId}:`, validationResult.error.format());
        throw new Error(`Invalid budget-usage payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map to Drizzle schema format
    const record = {
        advertiserId: data.advertiserId,
        marketplaceId: data.marketplaceId,
        datasetId: data.datasetId,
        budgetScopeId: data.budgetScopeId,
        budgetScopeType: data.budgetScopeType,
        advertisingProductType: data.advertisingProductType,
        budget: data.budget,
        budgetUsagePercentage: data.budgetUsagePercentage,
        usageUpdatedTimestamp: new Date(data.usageUpdatedTimestamp),
    };

    // Upsert with idempotency using composite unique key
    await db
        .insert(ams_budget_usage)
        .values(record)
        .onConflictDoUpdate({
            target: [
                ams_budget_usage.advertiserId,
                ams_budget_usage.marketplaceId,
                ams_budget_usage.budgetScopeId,
                ams_budget_usage.usageUpdatedTimestamp,
            ],
            set: {
                datasetId: record.datasetId,
                budgetScopeType: record.budgetScopeType,
                advertisingProductType: record.advertisingProductType,
                budget: record.budget,
                budgetUsagePercentage: record.budgetUsagePercentage,
            },
        });
}


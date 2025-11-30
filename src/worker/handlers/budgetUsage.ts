import { db } from '@/db/index.js';
import { ams_budget_usage } from '@/db/schema.js';
import { budgetUsageSchema } from '../schemas.js';

/**
 * Handle Budget Usage events
 */
export async function handleBudgetUsage(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = budgetUsageSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';
        console.error(
            `[handleBudgetUsage] Validation failed for datasetId ${datasetId}:`,
            validationResult.error.format()
        );
        throw new Error(`Invalid budget-usage payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map from snake_case (AMS) to camelCase (Drizzle schema)
    const record = {
        advertiserId: data.advertiser_id,
        marketplaceId: data.marketplace_id,
        datasetId: data.dataset_id,
        budgetScopeId: data.budget_scope_id,
        budgetScopeType: data.budget_scope_type,
        advertisingProductType: data.advertising_product_type,
        budget: data.budget,
        budgetUsagePercentage: data.budget_usage_percentage,
        usageUpdatedTimestamp: new Date(data.usage_updated_timestamp),
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

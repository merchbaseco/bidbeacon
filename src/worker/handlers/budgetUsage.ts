import { db } from '@/db/index.js';
import { amsBudgetUsage } from '@/db/schema.js';
import { createContextLogger } from '@/utils/logger';
import { budgetUsageSchema } from '../schemas.js';

/**
 * Handle Budget Usage events
 */
export async function handleBudgetUsage(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = budgetUsageSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'dataset_id' in payload ? String(payload.dataset_id) : 'unknown';
        const logger = createContextLogger({ component: 'handler', handler: 'budgetUsage', datasetId });
        logger.error({ err: validationResult.error, validationErrors: validationResult.error.format() }, 'Validation failed');
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
        .insert(amsBudgetUsage)
        .values(record)
        .onConflictDoUpdate({
            target: [amsBudgetUsage.advertiserId, amsBudgetUsage.marketplaceId, amsBudgetUsage.budgetScopeId, amsBudgetUsage.usageUpdatedTimestamp],
            set: {
                datasetId: record.datasetId,
                budgetScopeType: record.budgetScopeType,
                advertisingProductType: record.advertisingProductType,
                budget: record.budget,
                budgetUsagePercentage: record.budgetUsagePercentage,
            },
        });
}

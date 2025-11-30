import { db } from '@/db/index.js';
import { ams_cm_campaigns } from '@/db/schema.js';
import { campaignSchema } from '../schemas.js';

/**
 * Handle Campaign Management Campaign events
 */
export async function handleCampaigns(payload: unknown): Promise<void> {
    // Validate payload with Zod
    const validationResult = campaignSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'datasetId' in payload
            ? String(payload.datasetId)
            : 'unknown';
        console.error(`[handleCampaigns] Validation failed for datasetId ${datasetId}:`, validationResult.error.format());
        throw new Error(`Invalid campaigns payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map to Drizzle schema format
    const record = {
        datasetId: data.datasetId,
        advertiserId: data.advertiserId,
        marketplaceId: data.marketplaceId,
        campaignId: data.campaignId,
        accountId: data.accountId,
        portfolioId: data.portfolioId ?? null,
        adProduct: data.adProduct,
        productLocation: data.productLocation ?? null,
        version: data.version,
        name: data.name,
        startDateTime: data.startDateTime ? new Date(data.startDateTime) : null,
        endDateTime: data.endDateTime ? new Date(data.endDateTime) : null,
        state: data.state ?? null,
        tags: data.tags ?? null,
        targetingSettings: data.targetingSettings ?? null,
        budgetBudgetCapMonetaryBudgetAmount: data.budgetBudgetCapMonetaryBudgetAmount ?? null,
        budgetBudgetCapMonetaryBudgetCurrencyCode: data.budgetBudgetCapMonetaryBudgetCurrencyCode ?? null,
        budgetBudgetCapRecurrenceRecurrenceType: data.budgetBudgetCapRecurrenceRecurrenceType ?? null,
        bidSettingBidStrategy: data.bidSettingBidStrategy ?? null,
        bidSettingPlacementBidAdjustment: data.bidSettingPlacementBidAdjustment ?? null,
        bidSettingShopperCohortBidAdjustment: data.bidSettingShopperCohortBidAdjustment ?? null,
        auditCreationDateTime: data.auditCreationDateTime ? new Date(data.auditCreationDateTime) : null,
        auditLastUpdatedDateTime: data.auditLastUpdatedDateTime ? new Date(data.auditLastUpdatedDateTime) : null,
    };

    // Upsert with idempotency using campaignId + version
    await db
        .insert(ams_cm_campaigns)
        .values(record)
        .onConflictDoUpdate({
            target: [ams_cm_campaigns.campaignId, ams_cm_campaigns.version],
            set: record,
        });
}


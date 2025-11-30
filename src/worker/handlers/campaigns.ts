import { db } from '@/db/index.js';
import { ams_cm_campaigns } from '@/db/schema.js';
import { campaignSchema } from '../schemas.js';

/**
 * Handle Campaign Management Campaign events
 */
export async function handleCampaigns(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = campaignSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId =
            typeof payload === 'object' && payload !== null && 'dataset_id' in payload
                ? String(payload.dataset_id)
                : 'unknown';
        console.error(
            `[handleCampaigns] Validation failed for datasetId ${datasetId}:`,
            validationResult.error.format()
        );
        throw new Error(`Invalid campaigns payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map from snake_case (AMS) to camelCase (Drizzle schema)
    const record = {
        datasetId: data.dataset_id,
        advertiserId: data.advertiser_id,
        marketplaceId: data.marketplace_id,
        campaignId: data.campaign_id,
        accountId: data.account_id,
        portfolioId: data.portfolio_id ?? null,
        adProduct: data.ad_product,
        productLocation: data.product_location ?? null,
        version: data.version,
        name: data.name,
        startDateTime: data.start_date_time ? new Date(data.start_date_time) : null,
        endDateTime: data.end_date_time ? new Date(data.end_date_time) : null,
        state: data.state ?? null,
        tags: data.tags ?? null,
        targetingSettings: data.targeting_settings ?? null,
        budgetBudgetCapMonetaryBudgetAmount: data.budget_budget_cap_monetary_budget_amount ?? null,
        budgetBudgetCapMonetaryBudgetCurrencyCode:
            data.budget_budget_cap_monetary_budget_currency_code ?? null,
        budgetBudgetCapRecurrenceRecurrenceType:
            data.budget_budget_cap_recurrence_recurrence_type ?? null,
        bidSettingBidStrategy: data.bid_setting_bid_strategy ?? null,
        bidSettingPlacementBidAdjustment: data.bid_setting_placement_bid_adjustment ?? null,
        bidSettingShopperCohortBidAdjustment:
            data.bid_setting_shopper_cohort_bid_adjustment ?? null,
        auditCreationDateTime: data.audit_creation_date_time
            ? new Date(data.audit_creation_date_time)
            : null,
        auditLastUpdatedDateTime: data.audit_last_updated_date_time
            ? new Date(data.audit_last_updated_date_time)
            : null,
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

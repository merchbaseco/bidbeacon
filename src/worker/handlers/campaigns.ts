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
        campaignId: data.campaign_id,
        portfolioId: data.portfolio_id ?? null,
        adProduct: data.ad_product,
        marketplaceScope: data.marketplace_scope ?? null,
        marketplaces: data.marketplaces ?? null, // Array stored as jsonb
        name: data.name,
        skanAppId: data.skan_app_id ?? null,
        startDateTime: data.start_date_time ? new Date(data.start_date_time) : null,
        endDateTime: data.end_date_time ? new Date(data.end_date_time) : null,
        creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
        lastUpdatedDateTime: data.last_updated_date_time
            ? new Date(data.last_updated_date_time)
            : null,
        targetsAmazonDeal: data.targets_amazon_deal ?? null,
        brandId: data.brand_id ?? null,
        costType: data.cost_type ?? null,
        salesChannel: data.sales_channel ?? null,
        isMultiAdGroupsEnabled: data.is_multi_ad_groups_enabled ?? null,
        purchaseOrderNumber: data.purchase_order_number ?? null,
        // Nested objects stored as jsonb
        state: data.state ?? null,
        status: data.status ?? null,
        tags: data.tags ?? null, // Array of { key, value } objects
        budgets: data.budgets ?? null,
        frequencies: data.frequencies ?? null,
        autoCreationSettings: data.auto_creation_settings ?? null,
        optimizations: data.optimizations ?? null,
        fee: data.fee ?? null,
        flights: data.flights ?? null,
    };

    // Upsert with idempotency using campaignId (unique identifier)
    await db
        .insert(ams_cm_campaigns)
        .values(record)
        .onConflictDoUpdate({
            target: [ams_cm_campaigns.campaignId],
            set: record,
        });
}

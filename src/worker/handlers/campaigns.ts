import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { amsCmCampaigns, campaign } from '@/db/schema.js';
import { recordEntityChange } from '@/lib/entity-change-history.js';
import { trackAmsEvent } from '@/utils/ams-metrics.js';
import { createContextLogger } from '@/utils/logger';
import { campaignSchema } from '../schemas.js';
import { resolveAmsDeliveryStatus, resolveAmsState } from './ams-state';

/**
 * Handle Campaign Management Campaign events
 */
export async function handleCampaigns(payload: unknown): Promise<void> {
    return trackAmsEvent('campaign', async () => {
        // Validate payload with Zod (AMS uses snake_case)
        const validationResult = campaignSchema.safeParse(payload);
        if (!validationResult.success) {
            const datasetId = typeof payload === 'object' && payload !== null && 'dataset_id' in payload ? String(payload.dataset_id) : 'unknown';
            const logger = createContextLogger({ component: 'handler', handler: 'campaigns', datasetId });
            logger.error({ err: validationResult.error, validationErrors: validationResult.error.format() }, 'Validation failed');
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
            lastUpdatedDateTime: data.last_updated_date_time ? new Date(data.last_updated_date_time) : null,
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
            .insert(amsCmCampaigns)
            .values(record)
            .onConflictDoUpdate({
                target: [amsCmCampaigns.campaignId],
                set: record,
            });

        await updateCampaignFromAms(data);
    });
}

const updateCampaignFromAms = async (data: { campaign_id: string; last_updated_date_time?: string; state?: unknown; status?: unknown }) => {
    const lastUpdated = data.last_updated_date_time ? new Date(data.last_updated_date_time) : null;
    if (!lastUpdated) {
        return;
    }

    const [current] = await db
        .select({
            campaignId: campaign.campaignId,
            accountId: campaign.accountId,
            countryCode: campaign.countryCode,
            state: campaign.state,
            lastUpdatedDateTime: campaign.lastUpdatedDateTime,
        })
        .from(campaign)
        .where(and(eq(campaign.campaignId, data.campaign_id), or(isNull(campaign.lastUpdatedDateTime), lte(campaign.lastUpdatedDateTime, lastUpdated))))
        .limit(1);

    if (!current) {
        return;
    }

    const updates: Record<string, unknown> = {
        lastUpdatedDateTime: lastUpdated,
    };

    const state = resolveAmsState(data.state);
    if (state) {
        updates.state = state;
    }

    const deliveryStatus = resolveAmsDeliveryStatus(data.status);
    if (deliveryStatus) {
        updates.deliveryStatus = deliveryStatus;
    }

    if (Object.keys(updates).length === 1) {
        return;
    }

    const [updated] = await db
        .update(campaign)
        .set(updates)
        .where(and(eq(campaign.campaignId, data.campaign_id), or(isNull(campaign.lastUpdatedDateTime), lte(campaign.lastUpdatedDateTime, lastUpdated))))
        .returning({ campaignId: campaign.campaignId });

    if (!updated) {
        return;
    }

    const nextState = typeof updates.state === 'string' ? updates.state : null;
    if (current.accountId && nextState && current.state !== nextState) {
        await recordEntityChange({
            accountId: current.accountId,
            countryCode: current.countryCode,
            entityType: 'campaign',
            entityId: current.campaignId,
            eventType: 'state_change',
            fieldName: 'state',
            previousValue: current.state,
            newValue: nextState,
            changedAt: lastUpdated,
            source: 'ams',
            rawPayload: data,
        });
    }
};

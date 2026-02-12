import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { ad, amsCmAds, campaign } from '@/db/schema.js';
import { recordEntityChange } from '@/lib/entity-change-history.js';
import { trackAmsEvent } from '@/utils/ams-metrics.js';
import { createContextLogger } from '@/utils/logger';
import { adSchema } from '../schemas.js';
import { resolveAmsDeliveryStatus, resolveAmsState } from './ams-state';

/**
 * Handle Campaign Management Ad events
 */
export async function handleAds(payload: unknown): Promise<void> {
    return trackAmsEvent('ad', async () => {
        // Validate payload with Zod (AMS uses snake_case)
        const validationResult = adSchema.safeParse(payload);
        if (!validationResult.success) {
            const datasetId = typeof payload === 'object' && payload !== null && 'dataset_id' in payload ? String(payload.dataset_id) : 'unknown';
            const logger = createContextLogger({ component: 'handler', handler: 'ads', datasetId });
            logger.error({ err: validationResult.error, validationErrors: validationResult.error.format() }, 'Validation failed');
            throw new Error(`Invalid ads payload: ${validationResult.error.message}`);
        }

        const data = validationResult.data;

        // Map from snake_case (AMS) to camelCase (Drizzle schema)
        const record = {
            datasetId: data.dataset_id,
            adId: data.ad_id,
            adGroupId: data.ad_group_id ?? null, // May be missing due to AMS data quality issues
            campaignId: data.campaign_id ?? null, // May be missing due to AMS data quality issues
            adProduct: data.ad_product,
            marketplaceScope: data.marketplace_scope ?? null,
            marketplaces: data.marketplaces ?? null, // Array stored as jsonb
            name: data.name ?? '', // Default to empty string if missing (DB requires NOT NULL)
            creationDateTime: data.creation_date_time ? new Date(data.creation_date_time) : null,
            lastUpdatedDateTime: data.last_updated_date_time ? new Date(data.last_updated_date_time) : null,
            adType: data.ad_type ?? null,
            // Nested objects stored as jsonb
            state: data.state ?? null,
            status: data.status ?? null,
            creative: data.creative ?? null,
            tags: data.tags ?? null, // Array of { key, value } objects
        };

        // Upsert with idempotency using adId
        await db
            .insert(amsCmAds)
            .values(record)
            .onConflictDoUpdate({
                target: [amsCmAds.adId],
                set: record,
            });

        await updateAdFromAms(data);
    });
}

const updateAdFromAms = async (data: { ad_id: string; last_updated_date_time?: string; state?: unknown; status?: unknown }) => {
    const lastUpdated = data.last_updated_date_time ? new Date(data.last_updated_date_time) : null;
    if (!lastUpdated) {
        return;
    }

    const [current] = await db
        .select({
            adId: ad.adId,
            accountId: campaign.accountId,
            countryCode: campaign.countryCode,
            state: ad.state,
            lastUpdatedDateTime: ad.lastUpdatedDateTime,
        })
        .from(ad)
        .leftJoin(campaign, eq(ad.campaignId, campaign.campaignId))
        .where(and(eq(ad.adId, data.ad_id), or(isNull(ad.lastUpdatedDateTime), lte(ad.lastUpdatedDateTime, lastUpdated))))
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
        .update(ad)
        .set(updates)
        .where(and(eq(ad.adId, data.ad_id), or(isNull(ad.lastUpdatedDateTime), lte(ad.lastUpdatedDateTime, lastUpdated))))
        .returning({ adId: ad.adId });

    if (!updated) {
        return;
    }

    const nextState = typeof updates.state === 'string' ? updates.state : null;
    if (current.accountId && nextState && current.state !== nextState) {
        await recordEntityChange({
            accountId: current.accountId,
            countryCode: current.countryCode,
            entityType: 'ad',
            entityId: current.adId,
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

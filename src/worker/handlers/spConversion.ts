import { db } from '@/db/index.js';
import { amsSpConversion } from '@/db/schema.js';
import { createContextLogger } from '@/utils/logger';
import { spConversionSchema } from '../schemas.js';

/**
 * Handle Sponsored Products Conversion events
 */
export async function handleSpConversion(payload: unknown): Promise<void> {
    // Validate payload with Zod (AMS uses snake_case)
    const validationResult = spConversionSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'dataset_id' in payload ? String(payload.dataset_id) : 'unknown';
        const logger = createContextLogger({ component: 'handler', handler: 'spConversion', datasetId });
        logger.error({ err: validationResult.error, validationErrors: validationResult.error.format() }, 'Validation failed');
        throw new Error(`Invalid sp-conversion payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map from snake_case (AMS) to camelCase (Drizzle schema)
    const record = {
        idempotencyId: data.idempotency_id,
        datasetId: data.dataset_id,
        marketplaceId: data.marketplace_id,
        currency: data.currency,
        advertiserId: data.advertiser_id,
        campaignId: data.campaign_id,
        adGroupId: data.ad_group_id,
        adId: data.ad_id,
        keywordId: data.keyword_id,
        placement: data.placement,
        timeWindowStart: new Date(data.time_window_start),
        attributedConversions1d: data.attributed_conversions_1d ?? null,
        attributedConversions7d: data.attributed_conversions_7d ?? null,
        attributedConversions14d: data.attributed_conversions_14d ?? null,
        attributedConversions30d: data.attributed_conversions_30d ?? null,
        attributedConversions1dSameSku: data.attributed_conversions_1d_same_sku ?? null,
        attributedConversions7dSameSku: data.attributed_conversions_7d_same_sku ?? null,
        attributedConversions14dSameSku: data.attributed_conversions_14d_same_sku ?? null,
        attributedConversions30dSameSku: data.attributed_conversions_30d_same_sku ?? null,
        attributedSales1d: data.attributed_sales_1d ?? null,
        attributedSales7d: data.attributed_sales_7d ?? null,
        attributedSales14d: data.attributed_sales_14d ?? null,
        attributedSales30d: data.attributed_sales_30d ?? null,
        attributedSales1dSameSku: data.attributed_sales_1d_same_sku ?? null,
        attributedSales7dSameSku: data.attributed_sales_7d_same_sku ?? null,
        attributedSales14dSameSku: data.attributed_sales_14d_same_sku ?? null,
        attributedSales30dSameSku: data.attributed_sales_30d_same_sku ?? null,
        attributedUnitsOrdered1d: data.attributed_units_ordered_1d ?? null,
        attributedUnitsOrdered7d: data.attributed_units_ordered_7d ?? null,
        attributedUnitsOrdered14d: data.attributed_units_ordered_14d ?? null,
        attributedUnitsOrdered30d: data.attributed_units_ordered_30d ?? null,
        attributedUnitsOrdered1dSameSku: data.attributed_units_ordered_1d_same_sku ?? null,
        attributedUnitsOrdered7dSameSku: data.attributed_units_ordered_7d_same_sku ?? null,
        attributedUnitsOrdered14dSameSku: data.attributed_units_ordered_14d_same_sku ?? null,
        attributedUnitsOrdered30dSameSku: data.attributed_units_ordered_30d_same_sku ?? null,
    };

    // Upsert with idempotency
    await db.insert(amsSpConversion).values(record).onConflictDoUpdate({
        target: amsSpConversion.idempotencyId,
        set: record,
    });
}

import { db } from '@/db/index.js';
import { ams_sp_conversion } from '@/db/schema.js';
import { spConversionSchema } from '../schemas.js';

/**
 * Handle Sponsored Products Conversion events
 */
export async function handleSpConversion(payload: unknown): Promise<void> {
    // Validate payload with Zod
    const validationResult = spConversionSchema.safeParse(payload);
    if (!validationResult.success) {
        const datasetId = typeof payload === 'object' && payload !== null && 'datasetId' in payload
            ? String(payload.datasetId)
            : 'unknown';
        console.error(`[handleSpConversion] Validation failed for datasetId ${datasetId}:`, validationResult.error.format());
        throw new Error(`Invalid sp-conversion payload: ${validationResult.error.message}`);
    }

    const data = validationResult.data;

    // Map to Drizzle schema format
    const record = {
        idempotencyId: data.idempotencyId,
        datasetId: data.datasetId,
        marketplaceId: data.marketplaceId,
        currency: data.currency,
        advertiserId: data.advertiserId,
        campaignId: data.campaignId,
        adGroupId: data.adGroupId,
        adId: data.adId,
        keywordId: data.keywordId,
        placement: data.placement,
        timeWindowStart: new Date(data.timeWindowStart),
        attributedConversions1d: data.attributedConversions1d ?? null,
        attributedConversions7d: data.attributedConversions7d ?? null,
        attributedConversions14d: data.attributedConversions14d ?? null,
        attributedConversions30d: data.attributedConversions30d ?? null,
        attributedConversions1dSameSku: data.attributedConversions1dSameSku ?? null,
        attributedConversions7dSameSku: data.attributedConversions7dSameSku ?? null,
        attributedConversions14dSameSku: data.attributedConversions14dSameSku ?? null,
        attributedConversions30dSameSku: data.attributedConversions30dSameSku ?? null,
        attributedSales1d: data.attributedSales1d ?? null,
        attributedSales7d: data.attributedSales7d ?? null,
        attributedSales14d: data.attributedSales14d ?? null,
        attributedSales30d: data.attributedSales30d ?? null,
        attributedSales1dSameSku: data.attributedSales1dSameSku ?? null,
        attributedSales7dSameSku: data.attributedSales7dSameSku ?? null,
        attributedSales14dSameSku: data.attributedSales14dSameSku ?? null,
        attributedSales30dSameSku: data.attributedSales30dSameSku ?? null,
        attributedUnitsOrdered1d: data.attributedUnitsOrdered1d ?? null,
        attributedUnitsOrdered7d: data.attributedUnitsOrdered7d ?? null,
        attributedUnitsOrdered14d: data.attributedUnitsOrdered14d ?? null,
        attributedUnitsOrdered30d: data.attributedUnitsOrdered30d ?? null,
        attributedUnitsOrdered1dSameSku: data.attributedUnitsOrdered1dSameSku ?? null,
        attributedUnitsOrdered7dSameSku: data.attributedUnitsOrdered7dSameSku ?? null,
        attributedUnitsOrdered14dSameSku: data.attributedUnitsOrdered14dSameSku ?? null,
        attributedUnitsOrdered30dSameSku: data.attributedUnitsOrdered30dSameSku ?? null,
    };

    // Upsert with idempotency
    await db
        .insert(ams_sp_conversion)
        .values(record)
        .onConflictDoUpdate({
            target: ams_sp_conversion.idempotencyId,
            set: record,
        });
}


import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { ApiRegion } from '@/amazon-ads/config';
import { getProductMetadata } from '@/amazon-ads/get-product-metadata';
import { db } from '@/db/index';
import { productMetadata } from '@/db/schema';
import { AMAZON_PRODUCT_METADATA_BATCH_SIZE, fetchProductMetadataBatches } from './product-metadata-batches';

export const updateProductMetadata = async (input: {
    countryCode: string;
    profileId: number;
    region: ApiRegion;
    asins: string[];
    skipExisting?: boolean;
    skipSyncedAtOrAfter?: Date;
}) => {
    const requestedAsins = [...new Set(input.asins)].sort();
    const skippedAsins = new Set<string>();
    if (input.skipExisting || input.skipSyncedAtOrAfter) {
        for (let offset = 0; offset < requestedAsins.length; offset += AMAZON_PRODUCT_METADATA_BATCH_SIZE) {
            const rows = await db
                .select({ asin: productMetadata.asin })
                .from(productMetadata)
                .where(
                    and(
                        eq(productMetadata.countryCode, input.countryCode),
                        inArray(productMetadata.asin, requestedAsins.slice(offset, offset + AMAZON_PRODUCT_METADATA_BATCH_SIZE)),
                        ...(input.skipSyncedAtOrAfter ? [gte(productMetadata.lastSyncedAt, input.skipSyncedAtOrAfter)] : [])
                    )
                );
            for (const row of rows) skippedAsins.add(row.asin);
        }
    }
    const asins = requestedAsins.filter(asin => !skippedAsins.has(asin));
    const fetched = await fetchProductMetadataBatches({
        asins,
        fetchBatch: asins => getProductMetadata({ profileId: input.profileId, region: input.region, asins }),
        onBatch: async products => {
            if (products.length === 0) return;
            const now = new Date();
            await db
                .insert(productMetadata)
                .values(products.map(product => ({ asin: product.asin, countryCode: input.countryCode, title: product.title, lastSyncedAt: now })))
                .onConflictDoUpdate({
                    target: [productMetadata.countryCode, productMetadata.asin],
                    set: { title: sql`coalesce(excluded.title, ${productMetadata.title})`, lastSyncedAt: now },
                });
        },
    });

    return {
        requestedCount: requestedAsins.length,
        returnedCount: skippedAsins.size + fetched.products.length,
        updatedCount: fetched.products.length,
        skippedCount: skippedAsins.size,
        requestCount: fetched.batchSizes.length,
        idealRequestCount: Math.ceil(asins.length / AMAZON_PRODUCT_METADATA_BATCH_SIZE),
        minBatchSize: fetched.batchSizes.length > 0 ? Math.min(...fetched.batchSizes) : 0,
        maxBatchSize: fetched.batchSizes.length > 0 ? Math.max(...fetched.batchSizes) : 0,
        averageBatchSize: fetched.batchSizes.length > 0 ? fetched.batchSizes.reduce((sum, size) => sum + size, 0) / fetched.batchSizes.length : 0,
        unresolvedCount: requestedAsins.length - skippedAsins.size - fetched.products.length,
        failureCount: 0,
    };
};

export const resolveApiRegion = (countryCode: string): ApiRegion => {
    if (['US', 'CA', 'MX', 'BR'].includes(countryCode)) return 'na';
    if (['JP', 'AU', 'IN', 'SG'].includes(countryCode)) return 'fe';
    return 'eu';
};

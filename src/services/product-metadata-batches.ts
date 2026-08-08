const AMAZON_PRODUCT_METADATA_BATCH_SIZE = 300;

export const fetchProductMetadataBatches = async (input: {
    asins: string[];
    fetchBatch: (asins: string[]) => Promise<Array<{ asin: string; title: string | null }>>;
    onBatch?: (products: Array<{ asin: string; title: string | null }>) => Promise<void>;
}) => {
    const asins = [...new Set(input.asins)].sort();
    const requestedAsins = new Set(asins);
    const productsByAsin = new Map<string, { asin: string; title: string | null }>();
    const batchSizes: number[] = [];

    for (let offset = 0; offset < asins.length; offset += AMAZON_PRODUCT_METADATA_BATCH_SIZE) {
        const batch = asins.slice(offset, offset + AMAZON_PRODUCT_METADATA_BATCH_SIZE);
        batchSizes.push(batch.length);
        const batchProducts = new Map<string, { asin: string; title: string | null }>();
        for (const product of await input.fetchBatch(batch)) {
            if (requestedAsins.has(product.asin)) {
                batchProducts.set(product.asin, product);
            }
        }
        if (offset === 0 && batchProducts.size === 0) {
            throw new Error(`Amazon Product Metadata returned no matching inventory for ${batch.length} advertised ${batch.length === 1 ? 'ASIN' : 'ASINs'}.`);
        }
        await input.onBatch?.([...batchProducts.values()]);
        for (const product of batchProducts.values()) {
            productsByAsin.set(product.asin, product);
        }
    }

    return { requestedAsins: asins, products: [...productsByAsin.values()], batchSizes };
};

export { AMAZON_PRODUCT_METADATA_BATCH_SIZE };

export const buildProductMetadataEvent = (action: 'Updated' | 'Refreshed', result: { returnedCount: number; requestCount: number }, payload: Record<string, unknown>) => ({
    message: `${action} ${result.returnedCount} products in ${result.requestCount} ${result.requestCount === 1 ? 'request' : 'requests'}.`,
    payload: { ...payload, ...result },
});

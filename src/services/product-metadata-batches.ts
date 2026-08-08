const AMAZON_PRODUCT_METADATA_BATCH_SIZE = 300;

export const fetchProductMetadataBatches = async (input: {
    asins: string[];
    fetchBatch: (asins: string[]) => Promise<Array<{ asin: string; title: string | null }>>;
    onBatch?: (asins: string[], products: Array<{ asin: string; title: string | null }>) => Promise<void>;
}) => {
    const asins = [...new Set(input.asins)];
    const requestedAsins = new Set(asins);
    const productsByAsin = new Map<string, { asin: string; title: string | null }>();
    const batchSizes: number[] = [];

    if (asins.length === 0) {
        return { requestedAsins: asins, products: [], batchSizes };
    }

    const preflightAsin = asins[0];
    const preflightProducts = new Map<string, { asin: string; title: string | null }>();
    batchSizes.push(1);
    for (const product of await input.fetchBatch([preflightAsin])) {
        if (product.asin === preflightAsin) {
            preflightProducts.set(product.asin, product);
        }
    }
    await input.onBatch?.([preflightAsin], [...preflightProducts.values()]);
    if (![...preflightProducts.values()].some(product => product.title?.trim())) {
        throw new Error(`Amazon Product Metadata returned no titled inventory record for advertised ASIN ${preflightAsin}.`);
    }
    for (const product of preflightProducts.values()) {
        productsByAsin.set(product.asin, product);
    }

    const remainingAsins = asins.slice(1);
    for (let offset = 0; offset < remainingAsins.length; offset += AMAZON_PRODUCT_METADATA_BATCH_SIZE) {
        const batch = remainingAsins.slice(offset, offset + AMAZON_PRODUCT_METADATA_BATCH_SIZE);
        batchSizes.push(batch.length);
        const batchProducts = new Map<string, { asin: string; title: string | null }>();
        for (const product of await input.fetchBatch(batch)) {
            if (requestedAsins.has(product.asin)) {
                batchProducts.set(product.asin, product);
            }
        }
        await input.onBatch?.(batch, [...batchProducts.values()]);
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

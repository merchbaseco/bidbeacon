import { createRankWranglerClient, DEFAULT_API_BASE_URL } from '@rankwrangler/http-client';

export type ResolvedProduct = {
    asin: string;
    title: string;
};

export type ProductResolver = {
    resolveProducts: (input: { marketplaceId: string; asins: string[] }) => Promise<ResolvedProduct[]>;
};

export const pendingRankWranglerProductResolver: ProductResolver = {
    resolveProducts: async () => [],
};

export const createRankWranglerProductResolver = ({
    accessCredential,
    baseUrl = DEFAULT_API_BASE_URL,
    createClient = createRankWranglerClient,
}: {
    accessCredential: string;
    baseUrl?: string;
    createClient?: typeof createRankWranglerClient;
}): ProductResolver => {
    const client = createClient({ baseUrl, batch: false, headers: { Authorization: `Bearer ${accessCredential}` } });

    return {
        resolveProducts: async ({ marketplaceId, asins }) => {
            const products = await client.product.getMany.mutate({ products: asins.map(asin => ({ marketplaceId, asin })) });
            return products.flatMap(product => (product.title ? [{ asin: product.asin, title: product.title }] : []));
        },
    };
};

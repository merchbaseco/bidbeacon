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

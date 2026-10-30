import { machineCredentialHeaders } from '@merchbaseco/access';
import { z } from 'zod';

const userIdPattern = /^mbu_[A-Za-z0-9_-]+$/;

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
    merchbaseUserId,
    clientId,
    clientSecret,
    baseUrl = 'https://rankwrangler-internal.merchbase.co',
    createClient = createRankWranglerClient,
}: {
    merchbaseUserId: string;
    clientId: string;
    clientSecret: string;
    baseUrl?: string;
    createClient?: typeof createRankWranglerClient;
}): ProductResolver => {
    const origin = new URL(baseUrl);
    if (
        origin.origin !== baseUrl ||
        (baseUrl !== 'https://rankwrangler-internal.merchbase.co' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', 'rankwrangler.test'].includes(origin.hostname)))
    ) {
        throw new Error('RankWrangler internal origin is required.');
    }
    if (!userIdPattern.test(merchbaseUserId)) {
        throw new Error('Canonical Merchbase user is required.');
    }
    const client = createClient({ baseUrl, batch: false, headers: { ...machineCredentialHeaders({ clientId, clientSecret }), 'x-merchbase-user-id': merchbaseUserId } });

    return {
        resolveProducts: async ({ marketplaceId, asins }) => {
            const products = await client.product.getMany.mutate({ products: asins.map(asin => ({ marketplaceId, asin })) });
            return products.flatMap(product => (product.title ? [{ asin: product.asin, title: product.title }] : []));
        },
    };
};

const productResponseSchema = z.object({ result: z.object({ data: z.array(z.object({ asin: z.string(), title: z.string().nullable() })) }) });
const createRankWranglerClient = ({ baseUrl, headers }: { baseUrl: string; batch: false; headers: Record<string, string> }) => ({
    product: {
        getMany: {
            mutate: async (input: { products: Array<{ marketplaceId: string; asin: string }> }) => {
                const response = await fetch(`${baseUrl}/api/api.public.product.getMany`, {
                    body: JSON.stringify(input),
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    method: 'POST',
                    redirect: 'manual',
                    credentials: 'omit',
                    signal: AbortSignal.timeout(5000),
                });
                if (response.status !== 200) {
                    await response.body?.cancel();
                    throw new Error('RankWrangler product lookup unavailable.');
                }
                return productResponseSchema.parse(await response.json()).result.data;
            },
        },
    },
});

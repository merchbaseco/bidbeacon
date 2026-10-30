import { db } from '@/db';
import { resolveAmazonAdsGateway } from './amazon-ads-gateway-selection';
import { createOperationContext, type OperationPrincipal } from './operation-context';
import { createRankWranglerProductResolver, pendingRankWranglerProductResolver } from './product-resolver';

export const createProductionOperationContext = (principal?: OperationPrincipal) =>
    createOperationContext({
        amazonAds: resolveAmazonAdsGateway(process.env),
        db,
        principal,
        products:
            principal && process.env.NODE_ENV !== 'development'
                ? createRankWranglerProductResolver({
                      merchbaseUserId: principal.merchbaseUserId,
                      clientId: requireCredential('MERCHBASE_ACCESS_BIDBEACON_CLIENT_ID'),
                      clientSecret: requireCredential('MERCHBASE_ACCESS_BIDBEACON_CLIENT_SECRET'),
                      baseUrl: process.env.BIDBEACON_RANKWRANGLER_BASE_URL?.trim() || undefined,
                  })
                : pendingRankWranglerProductResolver,
    });

const requireCredential = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required.`);
    }
    return value;
};

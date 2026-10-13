import { db } from '@/db';
import { resolveAmazonAdsGateway } from './amazon-ads-gateway-selection';
import { createOperationContext, type OperationPrincipal } from './operation-context';
import { createRankWranglerProductResolver, pendingRankWranglerProductResolver } from './product-resolver';

export const createProductionOperationContext = (principal?: OperationPrincipal, accessCredential?: string | null) =>
    createOperationContext({
        amazonAds: resolveAmazonAdsGateway(process.env),
        db,
        principal,
        products: accessCredential
            ? createRankWranglerProductResolver({
                  accessCredential,
                  baseUrl: process.env.BIDBEACON_RANKWRANGLER_BASE_URL?.trim() || undefined,
              })
            : pendingRankWranglerProductResolver,
    });

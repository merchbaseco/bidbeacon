import { db } from '@/db';
import { createOperationContext, type OperationPrincipal } from './operation-context';
import { createRankWranglerProductResolver, pendingRankWranglerProductResolver } from './product-resolver';
import { productionAmazonAdsGateway } from './production-amazon-ads-gateway';

export const createProductionOperationContext = (principal?: OperationPrincipal, accessCredential?: string | null) =>
    createOperationContext({
        amazonAds: productionAmazonAdsGateway,
        db,
        principal,
        products: accessCredential
            ? createRankWranglerProductResolver({
                  accessCredential,
                  baseUrl: process.env.RANKWRANGLER_BASE_URL?.trim() || undefined,
              })
            : pendingRankWranglerProductResolver,
    });

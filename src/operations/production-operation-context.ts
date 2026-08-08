import { db } from '@/db';
import { createOperationContext, type OperationPrincipal } from './operation-context';
import { pendingRankWranglerProductResolver } from './product-resolver';
import { productionAmazonAdsGateway } from './production-amazon-ads-gateway';

export const createProductionOperationContext = (principal?: OperationPrincipal) =>
    createOperationContext({ amazonAds: productionAmazonAdsGateway, db, principal, products: pendingRankWranglerProductResolver });

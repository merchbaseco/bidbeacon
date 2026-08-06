import { db } from '@/db';
import { createOperationContext } from './operation-context';
import { productionAmazonAdsGateway } from './production-amazon-ads-gateway';

export const createProductionOperationContext = () => createOperationContext({ amazonAds: productionAmazonAdsGateway, db });

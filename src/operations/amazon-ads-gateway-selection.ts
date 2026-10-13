import type { AmazonAdsGateway } from './amazon-ads-gateway';
import { createLocalAmazonAdsGateway, LOCAL_AMAZON_ADS_CALL_LOG } from './local-amazon-ads-gateway';
import { productionAmazonAdsGateway } from './production-amazon-ads-gateway';

export const resolveAmazonAdsGateway = (env: NodeJS.ProcessEnv): AmazonAdsGateway => {
    const requested = env.BIDBEACON_AMAZON_ADS_GATEWAY?.trim() || 'amazon';
    if (requested === 'amazon') {
        return productionAmazonAdsGateway;
    }
    if (requested !== 'fake') {
        throw new Error('BIDBEACON_AMAZON_ADS_GATEWAY must be amazon or fake.');
    }
    if (env.NODE_ENV === 'production' || env.VARLOCK_ENV === 'production') {
        throw new Error('BIDBEACON_AMAZON_ADS_GATEWAY=fake cannot be selected when NODE_ENV or VARLOCK_ENV is production.');
    }
    return createLocalAmazonAdsGateway({ logPath: LOCAL_AMAZON_ADS_CALL_LOG });
};

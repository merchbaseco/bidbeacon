import { appendFileSync } from 'node:fs';
import type { AmazonAdsGateway, AmazonAdsGatewayCall, AmazonAdsOperation } from './amazon-ads-gateway';

export const LOCAL_AMAZON_ADS_CALL_LOG = '/tmp/bidbeacon-amazon-ads-calls.jsonl';
export const INELIGIBLE_ASIN = 'B0INELIGBL';
export const INELIGIBLE_CODE = 'PRODUCT_INELIGIBLE';

const operationShape = {
    createAdGroups: { batch: 'adGroups', entity: 'adGroup', id: 'adGroupId' },
    createAds: { batch: 'ads', entity: 'ad', id: 'adId' },
    createCampaigns: { batch: 'campaigns', entity: 'campaign', id: 'campaignId' },
    createTargets: { batch: 'targets', entity: 'target', id: 'targetId' },
    deleteAdGroups: { batch: 'adGroups', entity: 'adGroup', id: 'adGroupId' },
    deleteAds: { batch: 'ads', entity: 'ad', id: 'adId' },
    deleteCampaignNegativeKeywords: { batch: 'targets', entity: 'target', id: 'targetId' },
    deleteCampaignNegativeTargets: { batch: 'targets', entity: 'target', id: 'targetId' },
    deleteCampaigns: { batch: 'campaigns', entity: 'campaign', id: 'campaignId' },
    deleteKeywords: { batch: 'targets', entity: 'target', id: 'targetId' },
    deleteNegativeKeywords: { batch: 'targets', entity: 'target', id: 'targetId' },
    deleteNegativeTargets: { batch: 'targets', entity: 'target', id: 'targetId' },
    deleteTargets: { batch: 'targets', entity: 'target', id: 'targetId' },
    updateAdGroups: { batch: 'adGroups', entity: 'adGroup', id: 'adGroupId' },
    updateAds: { batch: 'ads', entity: 'ad', id: 'adId' },
    updateCampaigns: { batch: 'campaigns', entity: 'campaign', id: 'campaignId' },
    updateTargets: { batch: 'targets', entity: 'target', id: 'targetId' },
} satisfies Record<AmazonAdsOperation, { batch: string; entity: string; id: string }>;

export const createLocalAmazonAdsGateway = ({ logPath }: { logPath?: string } = {}) => {
    const calls: AmazonAdsGatewayCall[] = [];
    let sequence = 0;

    const request = async (operation: AmazonAdsOperation, input: unknown) => {
        calls.push({ operation, input });
        if (logPath) {
            appendFileSync(logPath, `${JSON.stringify({ operation, input })}\n`);
        }
        const shape = operationShape[operation];
        const batch = readBatch(input, shape.batch);
        const errors = batch.flatMap((item, index) => (mentionsIneligible(item) ? [rejection(index)] : []));
        if (errors.length > 0) {
            return { error: errors };
        }
        return {
            success: batch.map(item => {
                sequence += 1;
                return {
                    [shape.entity]: {
                        ...item,
                        [shape.id]: readId(item[shape.id]) ?? `fake-${shape.id}-${sequence}`,
                    },
                };
            }),
        };
    };

    return {
        calls,
        createAdGroups: (input: Parameters<AmazonAdsGateway['createAdGroups']>[0]) => request('createAdGroups', input),
        createAds: (input: Parameters<AmazonAdsGateway['createAds']>[0]) => request('createAds', input),
        createCampaigns: (input: Parameters<AmazonAdsGateway['createCampaigns']>[0]) => request('createCampaigns', input),
        createTargets: (input: Parameters<AmazonAdsGateway['createTargets']>[0]) => request('createTargets', input),
        deleteAdGroups: (input: Parameters<AmazonAdsGateway['deleteAdGroups']>[0]) => request('deleteAdGroups', input),
        deleteAds: (input: Parameters<AmazonAdsGateway['deleteAds']>[0]) => request('deleteAds', input),
        deleteCampaignNegativeKeywords: (input: Parameters<AmazonAdsGateway['deleteCampaignNegativeKeywords']>[0]) => request('deleteCampaignNegativeKeywords', input),
        deleteCampaignNegativeTargets: (input: Parameters<AmazonAdsGateway['deleteCampaignNegativeTargets']>[0]) => request('deleteCampaignNegativeTargets', input),
        deleteCampaigns: (input: Parameters<AmazonAdsGateway['deleteCampaigns']>[0]) => request('deleteCampaigns', input),
        deleteKeywords: (input: Parameters<AmazonAdsGateway['deleteKeywords']>[0]) => request('deleteKeywords', input),
        deleteNegativeKeywords: (input: Parameters<AmazonAdsGateway['deleteNegativeKeywords']>[0]) => request('deleteNegativeKeywords', input),
        deleteNegativeTargets: (input: Parameters<AmazonAdsGateway['deleteNegativeTargets']>[0]) => request('deleteNegativeTargets', input),
        deleteTargets: (input: Parameters<AmazonAdsGateway['deleteTargets']>[0]) => request('deleteTargets', input),
        updateAdGroups: (input: Parameters<AmazonAdsGateway['updateAdGroups']>[0]) => request('updateAdGroups', input),
        updateAds: (input: Parameters<AmazonAdsGateway['updateAds']>[0]) => request('updateAds', input),
        updateCampaigns: (input: Parameters<AmazonAdsGateway['updateCampaigns']>[0]) => request('updateCampaigns', input),
        updateTargets: (input: Parameters<AmazonAdsGateway['updateTargets']>[0]) => request('updateTargets', input),
    } satisfies AmazonAdsGateway & { calls: AmazonAdsGatewayCall[] };
};

const rejection = (index: number) => ({
    index,
    errors: [{ code: INELIGIBLE_CODE, message: 'Product is ineligible for advertising.' }],
});

const readBatch = (input: unknown, batchKey: string) => {
    if (!(isRecord(input) && Array.isArray(input[batchKey]))) {
        return [{}];
    }
    return input[batchKey].filter(isRecord);
};

const mentionsIneligible = (value: unknown): boolean => {
    if (typeof value === 'string') {
        return value === INELIGIBLE_CODE || value === INELIGIBLE_ASIN;
    }
    if (Array.isArray(value)) {
        return value.some(mentionsIneligible);
    }
    if (isRecord(value)) {
        return Object.values(value).some(mentionsIneligible);
    }
    return false;
};

const readId = (value: unknown) => (typeof value === 'string' && value.trim().length > 0 ? value : undefined);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

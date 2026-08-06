import type { ApiRegion } from '@/amazon-ads/config';

type AmazonAdsRequest = {
    profileId: number;
    region?: ApiRegion;
};

type AmazonAdsGatewayResponse = {
    success?: Record<string, unknown>[];
    error?: Record<string, unknown>[];
};

export type AmazonAdsGateway = {
    createAdGroups: (input: AmazonAdsRequest & { adGroups: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    createAds: (input: AmazonAdsRequest & { ads: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    createCampaigns: (input: AmazonAdsRequest & { campaigns: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    createTargets: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    updateAdGroups: (input: AmazonAdsRequest & { adGroups: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    updateAds: (input: AmazonAdsRequest & { ads: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    updateCampaigns: (input: AmazonAdsRequest & { campaigns: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    updateTargets: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
};

export type AmazonAdsOperation = keyof AmazonAdsGateway;

export type AmazonAdsGatewayCall = {
    operation: AmazonAdsOperation;
    input: unknown;
};

export type FakeAmazonAdsGateway = AmazonAdsGateway & {
    readonly calls: AmazonAdsGatewayCall[];
};

type AmazonAdsResponses = Partial<Record<AmazonAdsOperation, AmazonAdsGatewayResponse>>;

export const createFakeAmazonAdsGateway = ({
    responses = {},
    failure,
}: {
    responses?: AmazonAdsResponses;
    failure?: {
        operation: AmazonAdsOperation;
        callNumber?: number;
        message?: string;
    };
} = {}): FakeAmazonAdsGateway => {
    const calls: AmazonAdsGatewayCall[] = [];
    const operationCallCounts = new Map<AmazonAdsOperation, number>();

    const request = async (operation: AmazonAdsOperation, input: unknown) => {
        calls.push({ operation, input });
        const callNumber = (operationCallCounts.get(operation) ?? 0) + 1;
        operationCallCounts.set(operation, callNumber);

        if (failure?.operation === operation && (failure.callNumber ?? 1) === callNumber) {
            throw new Error(failure.message ?? `Amazon Ads fake failed at ${operation}.`);
        }

        return responses[operation] ?? defaultResponses[operation];
    };

    return {
        calls,
        createAdGroups: input => request('createAdGroups', input),
        createAds: input => request('createAds', input),
        createCampaigns: input => request('createCampaigns', input),
        createTargets: input => request('createTargets', input),
        updateAdGroups: input => request('updateAdGroups', input),
        updateAds: input => request('updateAds', input),
        updateCampaigns: input => request('updateCampaigns', input),
        updateTargets: input => request('updateTargets', input),
    };
};

const defaultResponses: Record<AmazonAdsOperation, AmazonAdsGatewayResponse> = {
    createAdGroups: { success: [{ adGroupId: 'ad-group-1' }] },
    createAds: { success: [{ adId: 'ad-1' }] },
    createCampaigns: { success: [{ campaignId: 'campaign-1' }] },
    createTargets: { success: [{ targetId: 'target-1' }] },
    updateAdGroups: { success: [{ adGroupId: 'ad-group-1' }] },
    updateAds: { success: [{ adId: 'ad-1' }] },
    updateCampaigns: { success: [{ campaignId: 'campaign-1' }] },
    updateTargets: { success: [{ targetId: 'target-1' }] },
};

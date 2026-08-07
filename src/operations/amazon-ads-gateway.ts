import type { ApiRegion } from '@/amazon-ads/config';

type AmazonAdsRequest = {
    profileId: number;
    region?: ApiRegion;
};

type AmazonAdsGatewayResponse = {
    success?: Record<string, unknown>[];
    error?: Record<string, unknown>[];
    partialSuccess?: Record<string, unknown>[];
};

export type AmazonAdsGateway = {
    createAdGroups: (input: AmazonAdsRequest & { adGroups: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    createAds: (input: AmazonAdsRequest & { ads: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    createCampaigns: (input: AmazonAdsRequest & { campaigns: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    createTargets: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteAdGroups: (input: AmazonAdsRequest & { adGroups: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteAds: (input: AmazonAdsRequest & { ads: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteCampaignNegativeKeywords: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteCampaignNegativeTargets: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteCampaigns: (input: AmazonAdsRequest & { campaigns: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteKeywords: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteNegativeKeywords: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteNegativeTargets: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
    deleteTargets: (input: AmazonAdsRequest & { targets: unknown[] }) => Promise<AmazonAdsGatewayResponse>;
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
type AmazonAdsResponseSequences = Partial<Record<AmazonAdsOperation, AmazonAdsGatewayResponse[]>>;

export const createFakeAmazonAdsGateway = ({
    responses = {},
    responseSequences = {},
    failure,
}: {
    responses?: AmazonAdsResponses;
    responseSequences?: AmazonAdsResponseSequences;
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

        return responseSequences[operation]?.[callNumber - 1] ?? responses[operation] ?? defaultResponses[operation];
    };

    return {
        calls,
        createAdGroups: input => request('createAdGroups', input),
        createAds: input => request('createAds', input),
        createCampaigns: input => request('createCampaigns', input),
        createTargets: input => request('createTargets', input),
        deleteAdGroups: input => request('deleteAdGroups', input),
        deleteAds: input => request('deleteAds', input),
        deleteCampaignNegativeKeywords: input => request('deleteCampaignNegativeKeywords', input),
        deleteCampaignNegativeTargets: input => request('deleteCampaignNegativeTargets', input),
        deleteCampaigns: input => request('deleteCampaigns', input),
        deleteKeywords: input => request('deleteKeywords', input),
        deleteNegativeKeywords: input => request('deleteNegativeKeywords', input),
        deleteNegativeTargets: input => request('deleteNegativeTargets', input),
        deleteTargets: input => request('deleteTargets', input),
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
    deleteAdGroups: { success: [{ adGroupId: 'ad-group-1' }] },
    deleteAds: { success: [{ adId: 'ad-1' }] },
    deleteCampaignNegativeKeywords: { success: [{ targetId: 'target-1' }] },
    deleteCampaignNegativeTargets: { success: [{ targetId: 'target-1' }] },
    deleteCampaigns: { success: [{ campaignId: 'campaign-1' }] },
    deleteKeywords: { success: [{ targetId: 'target-1' }] },
    deleteNegativeKeywords: { success: [{ targetId: 'target-1' }] },
    deleteNegativeTargets: { success: [{ targetId: 'target-1' }] },
    deleteTargets: { success: [{ targetId: 'target-1' }] },
    updateAdGroups: { success: [{ adGroupId: 'ad-group-1' }] },
    updateAds: { success: [{ adId: 'ad-1' }] },
    updateCampaigns: { success: [{ campaignId: 'campaign-1' }] },
    updateTargets: { success: [{ targetId: 'target-1' }] },
};

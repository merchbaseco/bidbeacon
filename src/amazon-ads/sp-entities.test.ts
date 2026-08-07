import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createTargets,
    deleteAdGroups,
    deleteAds,
    deleteCampaignNegativeKeywords,
    deleteCampaignNegativeTargets,
    deleteCampaigns,
    deleteKeywords,
    deleteNegativeKeywords,
    deleteNegativeTargets,
    deleteTargets,
    updateTargets,
} from './sp-entities';

const spApiMocks = vi.hoisted(() => ({
    request: vi.fn(),
}));

vi.mock('./sp-api', () => ({
    spRequest: spApiMocks.request,
}));

type SpRequestOptions = {
    apiName: string;
    path: string;
    profileId: number;
    body: unknown;
    accept?: string;
    contentType?: string;
    responseSchema?: {
        parse: (input: unknown) => unknown;
    };
};

describe('Sponsored Products Target entity gateway', () => {
    beforeEach(() => {
        spApiMocks.request.mockReset();
    });

    it.each([
        { operation: createTargets, apiName: 'spCreateTargets', path: '/adsApi/v1/create/targets' },
        { operation: updateTargets, apiName: 'spUpdateTargets', path: '/adsApi/v1/update/targets' },
    ])('preserves $apiName partialSuccess payloads at the production boundary', async ({ operation, apiName, path }) => {
        const target = { targetId: 'target-1', state: 'ENABLED' };
        const response = {
            success: [],
            error: [],
            partialSuccess: [
                {
                    target,
                    errors: [{ code: 'BID_ADJUSTED', message: 'Amazon accepted the Target with an adjusted bid.' }],
                },
            ],
        };
        spApiMocks.request.mockImplementation(async (options: SpRequestOptions) => options.responseSchema?.parse(response));

        await expect(operation({ profileId: 3001, region: 'na', targets: [target] })).resolves.toEqual(response);
        expect(spApiMocks.request).toHaveBeenCalledWith(
            {
                apiName,
                path,
                profileId: 3001,
                body: { targets: [target] },
                responseSchema: expect.anything(),
            },
            'na'
        );
    });

    it.each([
        {
            operation: deleteCampaigns,
            inputKey: 'campaigns',
            idKey: 'campaignId',
            apiName: 'spDeleteCampaigns',
            path: '/sp/campaigns/delete',
            mediaType: 'application/vnd.spcampaign.v3+json',
            responseKey: 'campaigns',
            filterKey: 'campaignIdFilter',
        },
        {
            operation: deleteAdGroups,
            inputKey: 'adGroups',
            idKey: 'adGroupId',
            apiName: 'spDeleteAdGroups',
            path: '/sp/adGroups/delete',
            mediaType: 'application/vnd.spadGroup.v3+json',
            responseKey: 'adGroups',
            filterKey: 'adGroupIdFilter',
        },
        {
            operation: deleteAds,
            inputKey: 'ads',
            idKey: 'adId',
            apiName: 'spDeleteAds',
            path: '/sp/productAds/delete',
            mediaType: 'application/vnd.spproductAd.v3+json',
            responseKey: 'productAds',
            filterKey: 'adIdFilter',
        },
        {
            operation: deleteKeywords,
            inputKey: 'targets',
            idKey: 'targetId',
            apiName: 'spDeleteKeywords',
            path: '/sp/keywords/delete',
            mediaType: 'application/vnd.spkeyword.v3+json',
            responseKey: 'keywords',
            filterKey: 'keywordIdFilter',
        },
        {
            operation: deleteNegativeKeywords,
            inputKey: 'targets',
            idKey: 'targetId',
            apiName: 'spDeleteNegativeKeywords',
            path: '/sp/negativeKeywords/delete',
            mediaType: 'application/vnd.spnegativeKeyword.v3+json',
            responseKey: 'negativeKeywords',
            filterKey: 'negativeKeywordIdFilter',
        },
        {
            operation: deleteCampaignNegativeKeywords,
            inputKey: 'targets',
            idKey: 'targetId',
            apiName: 'spDeleteCampaignNegativeKeywords',
            path: '/sp/campaignNegativeKeywords/delete',
            mediaType: 'application/vnd.spcampaignNegativeKeyword.v3+json',
            responseKey: 'campaignNegativeKeywords',
            filterKey: 'campaignNegativeKeywordIdFilter',
        },
        {
            operation: deleteTargets,
            inputKey: 'targets',
            idKey: 'targetId',
            apiName: 'spDeleteTargets',
            path: '/sp/targets/delete',
            mediaType: 'application/vnd.sptargetingClause.v3+json',
            responseKey: 'targetingClauses',
            filterKey: 'targetIdFilter',
        },
        {
            operation: deleteNegativeTargets,
            inputKey: 'targets',
            idKey: 'targetId',
            apiName: 'spDeleteNegativeTargets',
            path: '/sp/negativeTargets/delete',
            mediaType: 'application/vnd.spnegativeTargetingClause.v3+json',
            responseKey: 'negativeTargetingClauses',
            filterKey: 'negativeTargetingClauseIdFilter',
        },
        {
            operation: deleteCampaignNegativeTargets,
            inputKey: 'targets',
            idKey: 'targetId',
            apiName: 'spDeleteCampaignNegativeTargets',
            path: '/sp/campaignNegativeTargets/delete',
            mediaType: 'application/vnd.spcampaignNegativeTargetingClause.v3+json',
            responseKey: 'campaignNegativeTargetingClauses',
            filterKey: 'campaignNegativeTargetingClauseIdFilter',
        },
    ])('maps $apiName v3 delete requests and indexed success responses', async ({ operation, inputKey, idKey, apiName, path, mediaType, responseKey, filterKey }) => {
        const entityId = `${idKey}-1`;
        const input = { profileId: 3001, region: 'na' as const, [inputKey]: [{ [idKey === 'targetId' ? 'targetId' : idKey]: entityId }] };
        const response = { [responseKey]: { success: [{ index: 0 }] } };
        spApiMocks.request.mockImplementation(async (options: SpRequestOptions) => options.responseSchema?.parse(response));

        await expect(operation(input as never)).resolves.toEqual({ success: [{ [idKey]: entityId }] });
        expect(spApiMocks.request).toHaveBeenCalledWith(
            {
                apiName,
                path,
                profileId: 3001,
                body: { [filterKey]: { include: [entityId] } },
                responseSchema: expect.anything(),
                accept: mediaType,
                contentType: mediaType,
            },
            'na'
        );
    });

    it('treats an indexed Amazon entity-not-found delete result as archived', async () => {
        const response = {
            keywords: {
                error: [
                    {
                        errors: [
                            {
                                errorType: 'entityNotFoundError',
                                errorValue: { entityNotFoundError: { reason: 'ENTITY_NOT_FOUND' } },
                            },
                        ],
                    },
                ],
            },
        };
        spApiMocks.request.mockImplementation(async (options: SpRequestOptions) => options.responseSchema?.parse(response));

        await expect(deleteKeywords({ profileId: 3001, targets: [{ targetId: 'target-1' }] })).resolves.toEqual({
            success: [{ targetId: 'target-1' }],
        });
    });

    it('normalizes an indexed Amazon delete rejection for operation error mapping', async () => {
        const response = {
            campaigns: {
                error: [
                    {
                        index: 0,
                        errors: [
                            {
                                errorType: 'validationError',
                                errorValue: { validationError: { message: 'Campaign cannot be archived.' } },
                            },
                        ],
                    },
                ],
            },
        };
        spApiMocks.request.mockImplementation(async (options: SpRequestOptions) => options.responseSchema?.parse(response));

        await expect(deleteCampaigns({ profileId: 3001, campaigns: [{ campaignId: 'campaign-1' }] })).resolves.toEqual({
            error: [{ errorCode: 'validationError', message: 'Campaign cannot be archived.', index: 0 }],
        });
    });
});

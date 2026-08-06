import { z } from 'zod';
import type { ApiRegion } from './config';
import { spRequest } from './sp-api';

const multiStatusSchema = z.object({
    success: z.array(z.record(z.any())).optional(),
    error: z.array(z.record(z.any())).optional(),
    partialSuccess: z.array(z.record(z.any())).optional(),
});

type MultiStatusResponse = z.infer<typeof multiStatusSchema>;

const deleteResponseSchema = z
    .object({
        success: z.array(z.record(z.any())).optional(),
        error: z.array(z.record(z.any())).optional(),
        errors: z.array(z.record(z.any())).optional(),
    })
    .passthrough();

type DeleteResponse = z.infer<typeof deleteResponseSchema>;

const CAMPAIGN_V3_ACCEPT = 'application/vnd.spcampaign.v3+json';
const AD_GROUP_V3_ACCEPT = 'application/vnd.spadGroup.v3+json';
const PRODUCT_AD_V3_ACCEPT = 'application/vnd.spproductAd.v3+json';
const TARGET_V3_ACCEPT = 'application/vnd.sptargetingClause.v3+json';

type SpEntityOptions = {
    profileId: number;
    region?: ApiRegion;
};

export const createCampaigns = async (options: SpEntityOptions & { campaigns: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spCreateCampaigns',
            path: '/adsApi/v1/create/campaigns',
            profileId: options.profileId,
            body: { campaigns: options.campaigns },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const updateCampaigns = async (options: SpEntityOptions & { campaigns: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spUpdateCampaigns',
            path: '/adsApi/v1/update/campaigns',
            profileId: options.profileId,
            body: { campaigns: options.campaigns },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const deleteCampaigns = async (options: SpEntityOptions & { campaigns: unknown[] }) => {
    const campaignIds = options.campaigns.map(record => String((record as { campaignId?: string }).campaignId ?? '')).filter(Boolean);
    if (campaignIds.length === 0) {
        throw new Error('Missing campaign IDs for delete request.');
    }
    return spRequest<DeleteResponse>(
        {
            apiName: 'spDeleteCampaigns',
            path: '/sp/campaigns/delete',
            profileId: options.profileId,
            body: { campaignIdFilter: { include: campaignIds } },
            responseSchema: deleteResponseSchema,
            accept: CAMPAIGN_V3_ACCEPT,
            contentType: CAMPAIGN_V3_ACCEPT,
        },
        options.region
    );
};

export const createAdGroups = async (options: SpEntityOptions & { adGroups: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spCreateAdGroups',
            path: '/adsApi/v1/create/adGroups',
            profileId: options.profileId,
            body: { adGroups: options.adGroups },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const updateAdGroups = async (options: SpEntityOptions & { adGroups: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spUpdateAdGroups',
            path: '/adsApi/v1/update/adGroups',
            profileId: options.profileId,
            body: { adGroups: options.adGroups },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const deleteAdGroups = async (options: SpEntityOptions & { adGroups: unknown[] }) => {
    const adGroupIds = options.adGroups.map(record => String((record as { adGroupId?: string }).adGroupId ?? '')).filter(Boolean);
    if (adGroupIds.length === 0) {
        throw new Error('Missing ad group IDs for delete request.');
    }
    return spRequest<DeleteResponse>(
        {
            apiName: 'spDeleteAdGroups',
            path: '/sp/adGroups/delete',
            profileId: options.profileId,
            body: { adGroupIdFilter: { include: adGroupIds } },
            responseSchema: deleteResponseSchema,
            accept: AD_GROUP_V3_ACCEPT,
            contentType: AD_GROUP_V3_ACCEPT,
        },
        options.region
    );
};

export const createAds = async (options: SpEntityOptions & { ads: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spCreateAds',
            path: '/adsApi/v1/create/ads',
            profileId: options.profileId,
            body: { ads: options.ads },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const updateAds = async (options: SpEntityOptions & { ads: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spUpdateAds',
            path: '/adsApi/v1/update/ads',
            profileId: options.profileId,
            body: { ads: options.ads },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const deleteAds = async (options: SpEntityOptions & { ads: unknown[] }) => {
    const adIds = options.ads.map(record => String((record as { adId?: string }).adId ?? '')).filter(Boolean);
    if (adIds.length === 0) {
        throw new Error('Missing ad IDs for delete request.');
    }
    return spRequest<DeleteResponse>(
        {
            apiName: 'spDeleteAds',
            path: '/sp/productAds/delete',
            profileId: options.profileId,
            body: { adIdFilter: { include: adIds } },
            responseSchema: deleteResponseSchema,
            accept: PRODUCT_AD_V3_ACCEPT,
            contentType: PRODUCT_AD_V3_ACCEPT,
        },
        options.region
    );
};

export const createTargets = async (options: SpEntityOptions & { targets: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spCreateTargets',
            path: '/adsApi/v1/create/targets',
            profileId: options.profileId,
            body: { targets: options.targets },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const updateTargets = async (options: SpEntityOptions & { targets: unknown[] }) => {
    return spRequest<MultiStatusResponse>(
        {
            apiName: 'spUpdateTargets',
            path: '/adsApi/v1/update/targets',
            profileId: options.profileId,
            body: { targets: options.targets },
            responseSchema: multiStatusSchema,
        },
        options.region
    );
};

export const deleteTargets = async (options: SpEntityOptions & { targets: unknown[] }) => {
    const targetIds = options.targets.map(record => String((record as { targetId?: string }).targetId ?? '')).filter(Boolean);
    if (targetIds.length === 0) {
        throw new Error('Missing target IDs for delete request.');
    }
    return spRequest<DeleteResponse>(
        {
            apiName: 'spDeleteTargets',
            path: '/sp/targets/delete',
            profileId: options.profileId,
            body: { targetIdFilter: { include: targetIds } },
            responseSchema: deleteResponseSchema,
            accept: TARGET_V3_ACCEPT,
            contentType: TARGET_V3_ACCEPT,
        },
        options.region
    );
};

export const extractMultiStatusEntity = <T>(response: MultiStatusResponse, key: string, mapper: (value: unknown) => T) => {
    if (response.error && response.error.length > 0) {
        throw new Error(`Amazon Ads error: ${JSON.stringify(response.error[0])}`);
    }

    const success = response.success?.[0];
    if (!(success && key in success)) {
        throw new Error('Amazon Ads response missing success payload.');
    }

    return mapper((success as Record<string, unknown>)[key]);
};

export const assertDeleteResponse = (response: DeleteResponse, entityLabel: string) => {
    const errors = response.error ?? response.errors;
    if (errors && errors.length > 0) {
        throw new Error(`Amazon Ads error deleting ${entityLabel}: ${JSON.stringify(errors[0])}`);
    }
};

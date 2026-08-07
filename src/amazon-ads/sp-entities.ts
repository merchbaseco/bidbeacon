import { z } from 'zod';
import type { ApiRegion } from './config';
import { spRequest } from './sp-api';

const multiStatusSchema = z.object({
    success: z.array(z.record(z.any())).optional(),
    error: z.array(z.record(z.any())).optional(),
    partialSuccess: z.array(z.record(z.any())).optional(),
});

type MultiStatusResponse = z.infer<typeof multiStatusSchema>;

const deleteResultSchema = z
    .object({
        success: z.array(z.record(z.any())).optional(),
        error: z.array(z.record(z.any())).optional(),
        errors: z.array(z.record(z.any())).optional(),
    })
    .passthrough();
const deleteResponseSchema = z.record(deleteResultSchema);

type DeleteResponse = z.infer<typeof deleteResponseSchema>;

const CAMPAIGN_V3_ACCEPT = 'application/vnd.spcampaign.v3+json';
const AD_GROUP_V3_ACCEPT = 'application/vnd.spadGroup.v3+json';
const PRODUCT_AD_V3_ACCEPT = 'application/vnd.spproductAd.v3+json';
const KEYWORD_V3_ACCEPT = 'application/vnd.spkeyword.v3+json';
const NEGATIVE_KEYWORD_V3_ACCEPT = 'application/vnd.spnegativeKeyword.v3+json';
const CAMPAIGN_NEGATIVE_KEYWORD_V3_ACCEPT = 'application/vnd.spcampaignNegativeKeyword.v3+json';
const TARGET_V3_ACCEPT = 'application/vnd.sptargetingClause.v3+json';
const NEGATIVE_TARGET_V3_ACCEPT = 'application/vnd.spnegativeTargetingClause.v3+json';
const CAMPAIGN_NEGATIVE_TARGET_V3_ACCEPT = 'application/vnd.spcampaignNegativeTargetingClause.v3+json';

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
    const response = await spRequest<DeleteResponse>(
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
    return normalizeDeleteResponse(response, 'campaigns', 'campaignId', campaignIds);
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
    const response = await spRequest<DeleteResponse>(
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
    return normalizeDeleteResponse(response, 'adGroups', 'adGroupId', adGroupIds);
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
    const response = await spRequest<DeleteResponse>(
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
    return normalizeDeleteResponse(response, 'productAds', 'adId', adIds);
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
    const response = await spRequest<DeleteResponse>(
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
    return normalizeDeleteResponse(response, 'targetingClauses', 'targetId', targetIds);
};

export const deleteKeywords = async (options: SpEntityOptions & { targets: unknown[] }) =>
    deleteTargetEntities(options, {
        apiName: 'spDeleteKeywords',
        path: '/sp/keywords/delete',
        mediaType: KEYWORD_V3_ACCEPT,
        responseKey: 'keywords',
        idFilterKey: 'keywordIdFilter',
        idKey: 'targetId',
    });

export const deleteNegativeKeywords = async (options: SpEntityOptions & { targets: unknown[] }) =>
    deleteTargetEntities(options, {
        apiName: 'spDeleteNegativeKeywords',
        path: '/sp/negativeKeywords/delete',
        mediaType: NEGATIVE_KEYWORD_V3_ACCEPT,
        responseKey: 'negativeKeywords',
        idFilterKey: 'negativeKeywordIdFilter',
        idKey: 'targetId',
    });

export const deleteCampaignNegativeKeywords = async (options: SpEntityOptions & { targets: unknown[] }) =>
    deleteTargetEntities(options, {
        apiName: 'spDeleteCampaignNegativeKeywords',
        path: '/sp/campaignNegativeKeywords/delete',
        mediaType: CAMPAIGN_NEGATIVE_KEYWORD_V3_ACCEPT,
        responseKey: 'campaignNegativeKeywords',
        idFilterKey: 'campaignNegativeKeywordIdFilter',
        idKey: 'targetId',
    });

export const deleteNegativeTargets = async (options: SpEntityOptions & { targets: unknown[] }) =>
    deleteTargetEntities(options, {
        apiName: 'spDeleteNegativeTargets',
        path: '/sp/negativeTargets/delete',
        mediaType: NEGATIVE_TARGET_V3_ACCEPT,
        responseKey: 'negativeTargetingClauses',
        idFilterKey: 'negativeTargetingClauseIdFilter',
        idKey: 'targetId',
    });

export const deleteCampaignNegativeTargets = async (options: SpEntityOptions & { targets: unknown[] }) =>
    deleteTargetEntities(options, {
        apiName: 'spDeleteCampaignNegativeTargets',
        path: '/sp/campaignNegativeTargets/delete',
        mediaType: CAMPAIGN_NEGATIVE_TARGET_V3_ACCEPT,
        responseKey: 'campaignNegativeTargetingClauses',
        idFilterKey: 'campaignNegativeTargetingClauseIdFilter',
        idKey: 'targetId',
    });

const deleteTargetEntities = async (
    options: SpEntityOptions & { targets: unknown[] },
    definition: {
        apiName: string;
        path: string;
        mediaType: string;
        responseKey: string;
        idFilterKey: string;
        idKey: string;
    }
) => {
    const targetIds = options.targets.map(record => String((record as { targetId?: string }).targetId ?? '')).filter(Boolean);
    if (targetIds.length === 0) {
        throw new Error('Missing target IDs for delete request.');
    }
    const response = await spRequest<DeleteResponse>(
        {
            apiName: definition.apiName,
            path: definition.path,
            profileId: options.profileId,
            body: { [definition.idFilterKey]: { include: targetIds } },
            responseSchema: deleteResponseSchema,
            accept: definition.mediaType,
            contentType: definition.mediaType,
        },
        options.region
    );
    return normalizeDeleteResponse(response, definition.responseKey, definition.idKey, targetIds);
};

const normalizeDeleteResponse = (response: DeleteResponse, responseKey: string, idKey: string, requestedIds: string[]): MultiStatusResponse => {
    const result = response[responseKey];
    if (!result) {
        throw new Error(`Amazon Ads delete response missing ${responseKey} payload.`);
    }

    const success = (result.success ?? []).map((accepted, acceptedIndex) => {
        const index = typeof accepted.index === 'number' ? accepted.index : acceptedIndex;
        const id = requestedIds[index];
        if (!id) {
            throw new Error(`Amazon Ads delete response contained an invalid ${responseKey} success index.`);
        }
        return { [idKey]: id };
    });
    const errors: Record<string, unknown>[] = [];
    for (const [errorIndex, error] of (result.error ?? result.errors ?? []).entries()) {
        const index = typeof error.index === 'number' ? error.index : errorIndex;
        if (requestedIds[index] && isEntityNotFoundError(error)) {
            success.push({ [idKey]: requestedIds[index] });
        } else {
            errors.push(normalizeDeleteError(error, index));
        }
    }

    return {
        ...(success.length > 0 ? { success } : {}),
        ...(errors.length > 0 ? { error: errors } : {}),
    };
};

const isEntityNotFoundError = (error: Record<string, unknown>) => {
    const nestedErrors = Array.isArray(error.errors) ? error.errors : [];
    return (
        nestedErrors.length > 0 &&
        nestedErrors.every(nestedError => {
            if (!isRecord(nestedError)) {
                return false;
            }
            if (nestedError.errorType === 'entityNotFoundError') {
                return true;
            }
            const errorValue = isRecord(nestedError.errorValue) ? nestedError.errorValue : undefined;
            const entityNotFound = errorValue && isRecord(errorValue.entityNotFoundError) ? errorValue.entityNotFoundError : undefined;
            return entityNotFound?.reason === 'ENTITY_NOT_FOUND';
        })
    );
};

const normalizeDeleteError = (error: Record<string, unknown>, index: number) => {
    const firstError = Array.isArray(error.errors) && isRecord(error.errors[0]) ? error.errors[0] : error;
    const errorValue = isRecord(firstError.errorValue) ? firstError.errorValue : undefined;
    const nestedValue = errorValue ? Object.values(errorValue).find(isRecord) : undefined;
    return {
        ...(typeof firstError.code === 'string' ? { code: firstError.code } : {}),
        ...(typeof firstError.errorType === 'string' ? { errorCode: firstError.errorType } : {}),
        ...(typeof firstError.message === 'string' ? { message: firstError.message } : typeof nestedValue?.message === 'string' ? { message: nestedValue.message } : {}),
        index,
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

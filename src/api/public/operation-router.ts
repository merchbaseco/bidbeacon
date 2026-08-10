import { type TRPC_ERROR_CODE_KEY, TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { apiProcedure, router } from '@/api/trpc';
import { createAd, createAdGroup, updateAd, updateAdGroup } from '@/operations/ad-mutations';
import { adCreateInputSchema, adGroupCreateInputSchema, adGroupUpdateInputSchema, adUpdateInputSchema, canonicalAdGroupSchema, canonicalAdSchema } from '@/operations/ad-schemas';
import { listAdvertiserAccounts } from '@/operations/advertiser-accounts';
import { createCampaign, createSponsoredProductsCampaign, updateCampaign } from '@/operations/campaign-mutations';
import { campaignCreateInputSchema, campaignUpdateInputSchema, canonicalCampaignSchema } from '@/operations/campaign-schemas';
import { compositeCampaignCreateInputSchema, compositeCampaignCreationResultSchema } from '@/operations/composite-campaign-schemas';
import type { OperationContext } from '@/operations/operation-context';
import { OperationError, type OperationErrorCode } from '@/operations/operation-errors';
import { listAdvertiserAccountsInputSchema, listAdvertiserAccountsOutputSchema } from '@/operations/operation-schema';
import { performance } from '@/operations/performance';
import { performanceInputSchema, performanceOutputSchema } from '@/operations/performance-schemas';
import { search } from '@/operations/search';
import { searchInputSchema, searchOutputSchema } from '@/operations/search-planner';
import { createKeywordTarget, createNegativeKeyword, createNegativeProductTarget, createProductTarget, updateTarget } from '@/operations/target-mutations';
import {
    canonicalTargetSchema,
    keywordTargetCreateInputSchema,
    negativeKeywordCreateInputSchema,
    negativeProductTargetCreateInputSchema,
    productTargetCreateInputSchema,
    targetUpdateInputSchema,
} from '@/operations/target-schemas';

export const publicOperationProcedures = {
    list_advertiser_accounts: apiProcedure
        .input(listAdvertiserAccountsInputSchema)
        .output(listAdvertiserAccountsOutputSchema)
        .query(({ ctx, input }) => runOperation(ctx, listAdvertiserAccounts, input)),
    search: apiProcedure
        .input(searchInputSchema)
        .output(searchOutputSchema)
        .query(({ ctx, input }) => runOperation(ctx, search, input)),
    performance: apiProcedure
        .input(performanceInputSchema)
        .output(performanceOutputSchema)
        .query(({ ctx, input }) => runOperation(ctx, performance, input)),
    create_sponsored_products_campaign: apiProcedure
        .input(compositeCampaignCreateInputSchema)
        .output(compositeCampaignCreationResultSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createSponsoredProductsCampaign, input)),
    create_campaign: apiProcedure
        .input(campaignCreateInputSchema)
        .output(canonicalCampaignSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createCampaign, input)),
    create_ad_group: apiProcedure
        .input(adGroupCreateInputSchema)
        .output(canonicalAdGroupSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createAdGroup, input)),
    create_ad: apiProcedure
        .input(adCreateInputSchema)
        .output(canonicalAdSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createAd, input)),
    create_keyword_target: apiProcedure
        .input(keywordTargetCreateInputSchema)
        .output(canonicalTargetSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createKeywordTarget, input)),
    create_product_target: apiProcedure
        .input(productTargetCreateInputSchema)
        .output(canonicalTargetSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createProductTarget, input)),
    create_negative_keyword: apiProcedure
        .input(negativeKeywordCreateInputSchema)
        .output(canonicalTargetSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createNegativeKeyword, input)),
    create_negative_product_target: apiProcedure
        .input(negativeProductTargetCreateInputSchema)
        .output(canonicalTargetSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, createNegativeProductTarget, input)),
    update_campaign: apiProcedure
        .input(campaignUpdateInputSchema)
        .output(canonicalCampaignSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, updateCampaign, input)),
    update_ad_group: apiProcedure
        .input(adGroupUpdateInputSchema)
        .output(canonicalAdGroupSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, updateAdGroup, input)),
    update_ad: apiProcedure
        .input(adUpdateInputSchema)
        .output(canonicalAdSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, updateAd, input)),
    update_target: apiProcedure
        .input(targetUpdateInputSchema)
        .output(canonicalTargetSchema)
        .mutation(({ ctx, input }) => runOperation(ctx, updateTarget, input)),
} as const;

export const publicOperationRouter = router(publicOperationProcedures);

const runOperation = async <T>(context: Context, operation: (operationContext: OperationContext, input: unknown) => Promise<T>, input: unknown): Promise<T> => {
    try {
        return await operation(await getPublicOperationContext(context), input);
    } catch (error) {
        if (error instanceof OperationError) {
            throw new TRPCError({ code: toTrpcErrorCode(error.code), message: error.message, cause: error });
        }
        throw error;
    }
};

const getPublicOperationContext = async (context: Context): Promise<OperationContext> => {
    if (context.operationContext) {
        return context.operationContext as OperationContext;
    }

    if (!(context.user && context.credentialKind)) {
        throw new Error('An authenticated public operation context is required.');
    }

    const { createProductionOperationContext } = await import('@/operations/production-operation-context');
    return createProductionOperationContext(
        {
            accessibleAccountIds: context.accessibleAdvertiserAccountIds,
            credentialKind: context.credentialKind,
            merchbaseUserId: context.user.merchbaseUserId,
        },
        context.accessCredential
    );
};

const toTrpcErrorCode = (code: OperationErrorCode): TRPC_ERROR_CODE_KEY => {
    switch (code) {
        case 'AUTHENTICATION_REQUIRED':
            return 'UNAUTHORIZED';
        case 'ACCOUNT_ACCESS_DENIED':
            return 'FORBIDDEN';
        case 'INVALID_INPUT':
        case 'CURSOR_INVALID':
        case 'RESULT_TOO_LARGE':
        case 'RESPONSE_TOO_LARGE':
            return 'BAD_REQUEST';
        case 'RESOURCE_NOT_FOUND':
            return 'NOT_FOUND';
        case 'COMPOSITE_PARTIAL_FAILURE':
            return 'CONFLICT';
        case 'AMAZON_REJECTED':
        case 'AMAZON_UNAVAILABLE':
        case 'EXECUTION_TIMEOUT':
            return 'TIMEOUT';
        case 'INTERNAL_ERROR':
            return 'INTERNAL_SERVER_ERROR';
        default:
            return 'INTERNAL_SERVER_ERROR';
    }
};

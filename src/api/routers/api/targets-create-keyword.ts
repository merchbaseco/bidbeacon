import { apiProcedure } from '@/api/trpc';
import { targetsCreateKeywordInputSchema, targetsGetOutputSchema } from '@/api/schemas/cli';
import { createTargets, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, buildKeywordTargetDetails, mapTargetFromApi, resolveAccountContext } from './shared';

export const targetsCreateKeyword = apiProcedure
    .input(targetsCreateKeywordInputSchema)
    .output(targetsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await createTargets({
            profileId: account.profileId,
            region: account.region,
            targets: [
                {
                    adProduct: 'SPONSORED_PRODUCTS',
                    adGroupId: input.adGroupId,
                    bid: { bid: input.bid },
                    state: 'ENABLED',
                    negative: false,
                    targetType: 'KEYWORD',
                    targetDetails: buildKeywordTargetDetails(input.keyword, input.matchType),
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'target', value => mapTargetFromApi(value as Record<string, unknown>));
        return { item };
    });

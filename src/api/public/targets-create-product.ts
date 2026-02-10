import { createTargets, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { targetsCreateProductInputSchema, targetsGetOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, buildProductTargetDetails, mapTargetFromApi, resolveAccountContext } from './shared';

export const targetsCreateProduct = apiProcedure
    .input(targetsCreateProductInputSchema)
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
                    targetType: 'PRODUCT',
                    targetDetails: buildProductTargetDetails(input.productIdType, input.productId, input.matchType),
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'target', value => mapTargetFromApi(value as Record<string, unknown>));
        return { item };
    });

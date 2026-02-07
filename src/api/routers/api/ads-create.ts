import { apiProcedure } from '@/api/trpc';
import { adsCreateInputSchema, adsGetOutputSchema } from '@/api/schemas/cli';
import { createAds, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, buildAdCreativePayload, mapAdFromApi, resolveAccountContext } from './shared';

export const adsCreate = apiProcedure
    .input(adsCreateInputSchema)
    .output(adsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await createAds({
            profileId: account.profileId,
            region: account.region,
            ads: [
                {
                    adGroupId: input.adGroupId,
                    adProduct: 'SPONSORED_PRODUCTS',
                    adType: 'PRODUCT_AD',
                    state: 'ENABLED',
                    creative: buildAdCreativePayload(input.productIdType, input.productId),
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'ad', value => mapAdFromApi(value as Record<string, unknown>));
        return { item };
    });

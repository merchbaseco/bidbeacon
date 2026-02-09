import { extractMultiStatusEntity, updateAds } from '@/amazon-ads/sp-entities';
import { adsGetOutputSchema, adsUpdateInputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, mapAdFromApi, resolveAccountContext, updateAdRow } from './shared';

export const adsUpdate = apiProcedure
    .input(adsUpdateInputSchema)
    .output(adsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await updateAds({
            profileId: account.profileId,
            region: account.region,
            ads: [
                {
                    adId: input.adId,
                    state: input.state,
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'ad', value => mapAdFromApi(value as Record<string, unknown>));
        await updateAdRow(input.adId, { state: input.state });
        return { item };
    });

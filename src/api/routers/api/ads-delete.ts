import { z } from 'zod';
import { assertDeleteResponse, deleteAds } from '@/amazon-ads/sp-entities';
import { adsDeleteInputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, resolveAccountContext, updateAdRow } from './shared';

export const adsDelete = apiProcedure
    .input(adsDeleteInputSchema)
    .output(z.object({ deleted: z.literal(true), adId: z.string() }))
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await deleteAds({
            profileId: account.profileId,
            region: account.region,
            ads: [
                {
                    adId: input.adId,
                },
            ],
        });

        assertDeleteResponse(response, 'ad');
        await updateAdRow(input.adId, { state: 'ARCHIVED' });
        return { deleted: true, adId: input.adId };
    });

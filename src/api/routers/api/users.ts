import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { userPreferences } from '@/db/schema';
import { apiProcedure, router } from '@/api/trpc';

export const usersApiRouter = router({
    getSelectedAccount: apiProcedure.query(async ({ ctx }) => {
        const prefs = await db.query.userPreferences.findFirst({
            where: eq(userPreferences.clerkUserId, ctx.user.sub),
        });

        if (!prefs?.selectedAdsAccountId) {
            return null;
        }

        if (!ctx.accessibleAccountIds.includes(prefs.selectedAdsAccountId)) {
            return null;
        }

        return {
            adsAccountId: prefs.selectedAdsAccountId,
            profileId: prefs.selectedProfileId,
        };
    }),
});

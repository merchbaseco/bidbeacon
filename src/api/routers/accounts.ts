import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';
import { publicProcedure, router } from '../trpc.js';

export const accountsRouter = router({
    list: publicProcedure.query(async () => {
        console.log('[API] List advertising accounts request received');
        const data = await db.select().from(advertiserAccount);
        console.log(`[API] Returning ${data.length} advertising account(s)`);
        return { success: true, data };
    }),

    toggle: publicProcedure
        .input(
            z.object({
                adsAccountId: z.string(),
                profileId: z.string(),
                enabled: z.boolean(),
            })
        )
        .mutation(async ({ input }) => {
            console.log(`[API] Toggle advertiser account request: ${input.adsAccountId}/${input.profileId} -> ${input.enabled ? 'enabled' : 'disabled'}`);

            await db
                .update(advertiserAccount)
                .set({ enabled: input.enabled })
                .where(and(eq(advertiserAccount.adsAccountId, input.adsAccountId), eq(advertiserAccount.profileId, input.profileId)));

            const { emitEvent } = await import('@/utils/events.js');
            emitEvent({
                type: 'account:updated',
                accountId: input.adsAccountId,
                enabled: input.enabled,
            });

            return { success: true, message: `Account ${input.enabled ? 'enabled' : 'disabled'}` };
        }),

    sync: publicProcedure.mutation(async () => {
        const { listAdvertiserAccounts } = await import('@/amazon-ads/list-advertiser-accounts.js');
        console.log('[API] Sync advertiser accounts request received');

        const result = await listAdvertiserAccounts(undefined, 'na');

        for (const account of result.adsAccounts) {
            for (const countryCode of account.countryCodes) {
                const profileId = account.alternateIds.find(id => id.countryCode === countryCode && id.profileId !== undefined)?.profileId;
                const entityId = account.alternateIds.find(id => id.countryCode === countryCode && id.entityId !== undefined)?.entityId;

                if (!profileId || !entityId) {
                    continue;
                }

                const existingAccount = await db
                    .select()
                    .from(advertiserAccount)
                    .where(and(eq(advertiserAccount.adsAccountId, account.adsAccountId), eq(advertiserAccount.profileId, profileId.toString())))
                    .limit(1);

                if (existingAccount.length > 0) {
                    continue;
                }

                await db.insert(advertiserAccount).values({
                    adsAccountId: account.adsAccountId,
                    accountName: account.accountName,
                    status: account.status,
                    countryCode: countryCode,
                    profileId: profileId.toString(),
                    entityId: entityId,
                });
            }
        }

        console.log(`[API] Synced ${result.adsAccounts.length} account(s)`);
        return { success: true, message: 'Advertiser accounts synced successfully' };
    }),

    datasetMetadata: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .query(async ({ input }) => {
            console.log(`[API] Account dataset metadata request for account: ${input.accountId}, country: ${input.countryCode}`);

            const data = await db.query.accountDatasetMetadata.findFirst({
                where: (metadata, { and, eq }) => and(eq(metadata.accountId, input.accountId), eq(metadata.countryCode, input.countryCode)),
            });

            console.log(`[API] Returning account dataset metadata: ${data ? 'found' : 'not found'}`);
            return { success: true, data };
        }),
});

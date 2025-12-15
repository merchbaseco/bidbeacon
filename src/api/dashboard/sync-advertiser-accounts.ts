import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { listAdvertiserAccounts } from '@/amazon-ads/list-advertiser-accounts.js';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';

export function registerSyncAdvertiserAccountsRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/sync-advertiser-accounts', async (_request, _reply) => {
        console.log('[API] Sync advertiser accounts request received');

        const result = await listAdvertiserAccounts(undefined, 'na');

        for (const account of result.adsAccounts) {
            for (const countryCode of account.countryCodes) {
                const profileId = account.alternateIds.find(id => id.countryCode === countryCode && id.profileId !== undefined)?.profileId;
                const entityId = account.alternateIds.find(id => id.countryCode === countryCode && id.entityId !== undefined)?.entityId;

                if (!profileId || !entityId) {
                    continue;
                }

                // Check if account with same adsAccountId + profileId already exists
                const existingAccount = await db
                    .select()
                    .from(advertiserAccount)
                    .where(and(eq(advertiserAccount.adsAccountId, account.adsAccountId), eq(advertiserAccount.profileId, profileId.toString())))
                    .limit(1);

                // Skip if account already exists
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
    });
}

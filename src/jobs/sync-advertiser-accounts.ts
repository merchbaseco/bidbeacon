/**
 * Job: Sync Amazon Ads advertiser accounts from API to database
 * Runs on-demand to fetch and persist advertiser accounts
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { listAdvertiserAccounts } from '@/amazon-ads/list-advertiser-accounts.js';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { emitEvent } from '@/utils/events.js';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({});

export const syncAdvertiserAccountsJob = boss
    .createJob('sync-advertiser-accounts')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            console.log(`[Sync Advertiser Accounts] Starting job (ID: ${job.id})`);

            const result = await listAdvertiserAccounts(undefined, 'na');

            for (const account of result.adsAccounts) {
                await db.delete(advertiserAccount).where(eq(advertiserAccount.adsAccountId, account.adsAccountId));

                for (const countryCode of account.countryCodes) {
                    const profileId = account.alternateIds.find(id => id.countryCode === countryCode && id.profileId !== undefined)?.profileId;
                    const entityId = account.alternateIds.find(id => id.countryCode === countryCode && id.entityId !== undefined)?.entityId;

                    if (!profileId || !entityId) {
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

            console.log(`[Sync Advertiser Accounts] Synced ${result.adsAccounts.length} account(s)`);

            // Emit event to notify clients that accounts table was synced
            // This triggers a refresh of the advertising accounts list
            if (result.adsAccounts.length > 0) {
                emitEvent({
                    type: 'accounts:synced',
                });
            }
        }
    });

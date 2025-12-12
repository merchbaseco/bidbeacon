/**
 * Job: Sync Amazon Ads advertiser accounts from API to database
 * Runs on-demand to fetch and persist advertiser accounts
 */

import { z } from 'zod';
import { listAdvertiserAccounts } from '@/amazon-ads/list-advertiser-accounts.js';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({});

export const syncAdvertiserAccountsJob = boss
    .createJob('sync-advertiser-accounts')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const _ of jobs) {
            // Fetch accounts from Amazon Ads API
            const result = await listAdvertiserAccounts(undefined, 'na');

            // Upsert each account into the database
            for (const account of result.adsAccounts) {
                await db
                    .insert(advertiserAccount)
                    .values({
                        adsAccountId: account.adsAccountId,
                        accountName: account.accountName,
                        status: account.status,
                        alternateIds: account.alternateIds,
                        countryCodes: account.countryCodes,
                    })
                    .onConflictDoUpdate({
                        target: [advertiserAccount.adsAccountId],
                        set: {
                            accountName: account.accountName,
                            status: account.status,
                            alternateIds: account.alternateIds,
                            countryCodes: account.countryCodes,
                        },
                    });
            }

            console.log(
                `[Sync Advertiser Accounts] Synced ${result.adsAccounts.length} account(s)`
            );
        }
    });

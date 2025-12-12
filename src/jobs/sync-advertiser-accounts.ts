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
        for (const job of jobs) {
            console.log(`[Sync Advertiser Accounts] Starting job (ID: ${job.id})`);
            // Fetch accounts from Amazon Ads API
            const result = await listAdvertiserAccounts(undefined, 'na');

            // Upsert each account into the database
            // Denormalize: create one row per countryCode x profileId/entityId combination
            for (const account of result.adsAccounts) {
                // If there are alternateIds, use those (they contain countryCode + profileId/entityId)
                if (account.alternateIds && account.alternateIds.length > 0) {
                    for (const alternateId of account.alternateIds) {
                        await db
                            .insert(advertiserAccount)
                            .values({
                                adsAccountId: account.adsAccountId,
                                accountName: account.accountName,
                                status: account.status,
                                countryCode: alternateId.countryCode,
                                profileId: alternateId.profileId ?? null,
                                entityId: alternateId.entityId ?? null,
                            })
                            .onConflictDoUpdate({
                                target: [
                                    advertiserAccount.adsAccountId,
                                    advertiserAccount.countryCode,
                                    advertiserAccount.profileId,
                                    advertiserAccount.entityId,
                                ],
                                set: {
                                    accountName: account.accountName,
                                    status: account.status,
                                },
                            });
                    }
                } else {
                    // Fallback: if no alternateIds, create one row per countryCode
                    for (const countryCode of account.countryCodes) {
                        await db
                            .insert(advertiserAccount)
                            .values({
                                adsAccountId: account.adsAccountId,
                                accountName: account.accountName,
                                status: account.status,
                                countryCode: countryCode,
                                profileId: null,
                                entityId: null,
                            })
                            .onConflictDoUpdate({
                                target: [
                                    advertiserAccount.adsAccountId,
                                    advertiserAccount.countryCode,
                                    advertiserAccount.profileId,
                                    advertiserAccount.entityId,
                                ],
                                set: {
                                    accountName: account.accountName,
                                    status: account.status,
                                },
                            });
                    }
                }
            }

            console.log(
                `[Sync Advertiser Accounts] Synced ${result.adsAccounts.length} account(s)`
            );
        }
    });

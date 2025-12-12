/**
 * Job: Sync Amazon Ads profiles from API to database
 * Runs on-demand to fetch and persist profiles
 */

import { z } from 'zod';
import { listProfiles } from '@/amazon-ads/list-profiles.js';
import { db } from '@/db/index.js';
import { advertiserProfile } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({});

export const syncProfilesJob = boss
    .createJob('sync-profiles')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const _ of jobs) {
            // Fetch profiles from Amazon Ads API
            const profiles = await listProfiles(undefined, 'na');

            // Upsert each profile into the database
            for (const profile of profiles) {
                await db
                    .insert(advertiserProfile)
                    .values({
                        profileId: profile.profileId,
                        countryCode: profile.countryCode,
                        currencyCode: profile.currencyCode,
                        dailyBudget: profile.dailyBudget ?? null,
                        timezone: profile.timezone,
                        marketplaceStringId: profile.accountInfo.marketplaceStringId,
                        accountId: profile.accountInfo.id,
                        accountType: profile.accountInfo.type,
                        accountName: profile.accountInfo.name,
                        validPaymentMethod: profile.accountInfo.validPaymentMethod ?? false,
                    })
                    .onConflictDoUpdate({
                        target: [advertiserProfile.profileId],
                        set: {
                            countryCode: profile.countryCode,
                            currencyCode: profile.currencyCode,
                            dailyBudget: profile.dailyBudget ?? null,
                            timezone: profile.timezone,
                            marketplaceStringId: profile.accountInfo.marketplaceStringId,
                            accountId: profile.accountInfo.id,
                            accountType: profile.accountInfo.type,
                            accountName: profile.accountInfo.name,
                            validPaymentMethod: profile.accountInfo.validPaymentMethod ?? false,
                        },
                    });
            }

            console.log(`[Sync Profiles] Synced ${profiles.length} profile(s)`);
        }
    });

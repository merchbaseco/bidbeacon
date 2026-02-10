/**
 * Job: Enqueue daily ad entity syncs for all enabled accounts.
 * Runs once per day and emits sync-ad-entities-for-account jobs.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { withJobMetrics } from '@/utils/job-metrics';
import { syncAdEntitiesForAccountJob } from './sync-ad-entities-for-account';

export const syncAdEntitiesJob = boss
    .createJob('sync-ad-entities')
    .schedule({
        cron: '0 3 * * *', // Run daily at 03:00 UTC
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'sync-ad-entities',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async () => {
                        const enabledAccounts = await db
                            .select({
                                adsAccountId: advertiserAccount.adsAccountId,
                                countryCode: advertiserAccount.countryCode,
                            })
                            .from(advertiserAccount)
                            .where(eq(advertiserAccount.enabled, true));

                        await Promise.all(
                            enabledAccounts.map(account =>
                                syncAdEntitiesForAccountJob.emit({
                                    accountId: account.adsAccountId,
                                    countryCode: account.countryCode,
                                })
                            )
                        );
                    }
                )
            )
        );
    });

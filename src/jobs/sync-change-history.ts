/**
 * Job: Enqueue account-level change-history reconciliation.
 *
 * Runs hourly and emits sync-change-history-for-account jobs for all enabled
 * account + country pairs.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { withJobMetrics } from '@/utils/job-metrics';
import { syncChangeHistoryForAccountJob } from './sync-change-history-for-account';

export const syncChangeHistoryJob = boss
    .createJob('sync-change-history')
    .schedule({
        cron: '20 * * * *',
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'sync-change-history',
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
                                syncChangeHistoryForAccountJob.emit({
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

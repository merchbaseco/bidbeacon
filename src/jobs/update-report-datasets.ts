/**
 * Job: Update report datasets for all enabled accounts.
 * Runs every 5 minutes and enqueues update-report-dataset-for-account jobs
 * for each enabled accountId/countryCode combination.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { withJobMetrics } from '@/utils/job-metrics';
import { updateReportDatasetForAccountJob } from './update-report-dataset-for-account';

// ============================================================================
// Job Definition
// ============================================================================

export const updateReportDatasetsJob = boss
    .createJob('update-report-datasets')
    .schedule({
        cron: '*/5 * * * *', // Run every 5 minutes
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'update-report-datasets',
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
                                updateReportDatasetForAccountJob.emit({
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

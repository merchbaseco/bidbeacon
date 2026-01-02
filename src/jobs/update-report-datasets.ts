/**
 * Job: Update report datasets for all enabled accounts.
 * Runs every 5 minutes and enqueues update-report-dataset-for-account jobs
 * for each enabled accountId/countryCode combination.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { updateReportDatasetForAccountJob } from './update-report-dataset-for-account';
import { withJobSession } from '@/utils/job-sessions';

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
                withJobSession(
                    {
                        jobName: 'update-report-datasets',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const enabledAccounts = await db
                            .select({
                                adsAccountId: advertiserAccount.adsAccountId,
                                countryCode: advertiserAccount.countryCode,
                            })
                            .from(advertiserAccount)
                            .where(eq(advertiserAccount.enabled, true));

                        const accountJobPromises = enabledAccounts.map(async account => {
                            const bossJobId = await updateReportDatasetForAccountJob.emit({
                                accountId: account.adsAccountId,
                                countryCode: account.countryCode,
                            });
                            if (bossJobId) {
                                await recorder.addAction({
                                    type: 'enqueue-report-dataset-for-account',
                                    jobName: 'update-report-dataset-for-account',
                                    bossJobId,
                                    input: {
                                        accountId: account.adsAccountId,
                                        countryCode: account.countryCode,
                                    },
                                });
                            }
                        });

                        await Promise.all(accountJobPromises);

                        await recorder.addAction({
                            type: 'report-dataset-enqueue-summary',
                            accountsEnqueued: enabledAccounts.length,
                        });
                    }
                )
            )
        );
    });

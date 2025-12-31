/**
 * Job: Update report datasets for all enabled accounts.
 * Runs every 5 minutes and enqueues update-report-dataset-for-account jobs
 * for each enabled accountId/countryCode combination.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { updateReportDatasetForAccountJob } from './update-report-dataset-for-account.js';
import { withJobSession } from '@/utils/job-events.js';

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
                            await updateReportDatasetForAccountJob.emit({
                                accountId: account.adsAccountId,
                                countryCode: account.countryCode,
                            });
                        });

                        await Promise.all(accountJobPromises);

                        recorder.setFinalFields({
                            recordsProcessed: enabledAccounts.length,
                            metadata: {
                                accountsEnqueued: enabledAccounts.length,
                            },
                        });

                        await recorder.event({
                            eventType: 'reports:enqueue',
                            headline: `Queued ${enabledAccounts.length} account datasets`,
                        });
                    }
                )
            )
        );
    });

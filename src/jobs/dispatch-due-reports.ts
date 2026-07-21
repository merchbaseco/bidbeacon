import { and, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema';
import { boss } from '@/jobs/boss';
import { emitEvent } from '@/utils/events';
import { withJobMetrics } from '@/utils/job-metrics';
import { updateReportStatusJob } from './update-report-status';

const MAX_NEW_REPORT_JOBS_PER_ACCOUNT = 1;

export const dispatchDueReportsJob = boss
    .createJob('dispatch-due-reports')
    .schedule({
        cron: '* * * * *',
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'dispatch-due-reports',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const accounts = await db
                            .select({
                                accountId: advertiserAccount.adsAccountId,
                                countryCode: advertiserAccount.countryCode,
                            })
                            .from(advertiserAccount)
                            .where(eq(advertiserAccount.enabled, true));

                        const results = await Promise.all(accounts.map(account => dispatchAccountDueReports(account.accountId, account.countryCode)));
                        recorder.addEvent({
                            message: null,
                            payload: {
                                accountCount: accounts.length,
                                claimedCount: results.reduce((total, result) => total + result.claimedCount, 0),
                            },
                        });
                    }
                )
            )
        );
    });

const dispatchAccountDueReports = async (accountId: string, countryCode: string): Promise<{ claimedCount: number }> => {
    const now = new Date();
    const baseConditions = [
        eq(reportDatasetMetadata.accountId, accountId),
        eq(reportDatasetMetadata.countryCode, countryCode),
        eq(reportDatasetMetadata.entityType, 'target'),
        eq(reportDatasetMetadata.refreshing, false),
        lte(reportDatasetMetadata.nextRefreshAt, now),
    ];

    const activeReports = await db
        .select()
        .from(reportDatasetMetadata)
        .where(and(...baseConditions, isNotNull(reportDatasetMetadata.reportId)))
        .orderBy(desc(reportDatasetMetadata.periodStart));

    const newReports = await db
        .select()
        .from(reportDatasetMetadata)
        .where(and(...baseConditions, isNull(reportDatasetMetadata.reportId)))
        .orderBy(desc(reportDatasetMetadata.periodStart))
        .limit(MAX_NEW_REPORT_JOBS_PER_ACCOUNT);

    const claimed = await Promise.all([...activeReports, ...newReports].map(claimAndEnqueue));
    return { claimedCount: claimed.filter(Boolean).length };
};

const claimAndEnqueue = async (row: typeof reportDatasetMetadata.$inferSelect): Promise<boolean> => {
    const [claimedRow] = await db
        .update(reportDatasetMetadata)
        .set({ refreshing: true })
        .where(and(eq(reportDatasetMetadata.uid, row.uid), eq(reportDatasetMetadata.refreshing, false)))
        .returning();

    if (!claimedRow) {
        return false;
    }

    emitEvent({ type: 'report:refreshed', row: claimedRow });

    try {
        const jobId = await updateReportStatusJob.emit({
            accountId: claimedRow.accountId,
            countryCode: claimedRow.countryCode,
            timestamp: claimedRow.periodStart.toISOString(),
            aggregation: claimedRow.aggregation as 'hourly' | 'daily',
            entityType: claimedRow.entityType as 'target' | 'product',
            claimed: true,
        });

        if (!jobId) {
            throw new Error(`Failed to enqueue report metadata ${claimedRow.uid}`);
        }
        return true;
    } catch (error) {
        const [releasedRow] = await db.update(reportDatasetMetadata).set({ refreshing: false }).where(eq(reportDatasetMetadata.uid, claimedRow.uid)).returning();
        if (releasedRow) {
            emitEvent({ type: 'report:refreshed', row: releasedRow });
        }
        throw error;
    }
};

/**
 * Job: Keep performance_daily target rows on the freshest source for a specific account.
 * Covers today and the two most recent closed account-local dates. A date whose hourly data
 * (Marketing Stream rollup or hourly-grain report) is newer than its latest daily report is
 * re-derived from performance_hourly; otherwise the daily report rows stay.
 *
 * Emitted after every successful hourly Stream rollup and after any report is processed;
 * the 15-minute `summarize-daily-target-stream` schedule is a fallback. A per-date event is
 * recorded only when that date's source or derived row count changes.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { withDatabaseRetry } from '@/db/retry';
import { events } from '@/db/schema';
import { gateAccountWork } from '@/jobs/account-access-gate';
import { boss } from '@/jobs/boss';
import { hasDateStateChanged, toRecordedDateState } from '@/lib/daily-target-freshness/date-event';
import { type DailyTargetRefreshResult, refreshDailyTargetPerformance } from '@/lib/daily-target-freshness/refresh-daily-target-performance';
import { type JobMetricsRecorder, withJobMetrics } from '@/utils/job-metrics';
import { getTimezoneForCountry } from '@/utils/timezones';

const JOB_NAME = 'summarize-daily-target-stream-for-account';
const EVENT_LOOKBACK_MS = 4 * 24 * 60 * 60 * 1000;

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

export const summarizeDailyTargetStreamForAccountJob = boss
    .createJob(JOB_NAME)
    .input(jobInputSchema)
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: JOB_NAME,
                        bossJobId: job.id,
                        input: job.data,
                        accountId: job.data.accountId,
                        countryCode: job.data.countryCode,
                    },
                    async recorder => {
                        if (!(await gateAccountWork({ accountId: job.data.accountId, countryCode: job.data.countryCode, recorder }))) {
                            return;
                        }
                        return refreshDailyForAccount(job.data.accountId, job.data.countryCode, recorder);
                    }
                )
            )
        );
    });

const refreshDailyForAccount = async (accountId: string, countryCode: string, recorder: JobMetricsRecorder) => {
    const timezone = getTimezoneForCountry(countryCode);
    const results = await withDatabaseRetry(() => refreshDailyTargetPerformance({ database: db, accountId, countryCode }));

    const previous = await loadLastRecordedDateStates(accountId, countryCode);

    for (const result of results) {
        const state = toRecordedDateState(result);
        if (!hasDateStateChanged(previous.get(result.bucketDate), state)) {
            continue;
        }
        recorder.addEvent({
            message: describeResult(result),
            badges: [`daily target · ${formatInTimeZone(result.periodStart, timezone, 'MMM d')}`],
            payload: {
                cadence: 'daily',
                accountId,
                countryCode,
                bucketDate: result.bucketDate,
                source: result.decision.source,
                outcome: result.outcome,
                reason: result.decision.reason,
                hourlyAsOf: result.decision.hourlyAsOf?.toISOString() ?? null,
                streamAsOf: result.decision.streamAsOf?.toISOString() ?? null,
                hourlyReportAsOf: result.decision.hourlyReportAsOf?.toISOString() ?? null,
                dailyReportAsOf: result.decision.dailyAsOf?.toISOString() ?? null,
                rowsInserted: result.rowsChanged,
                rowsDerived: result.rowsDerived,
                rowsChanged: result.rowsChanged,
                rowsRemoved: result.rowsRemoved,
            },
        });
    }
};

/**
 * Latest recorded state per date, so a run only writes events for dates whose source or row
 * count changed. Dates leave the refresh window after three days, which bounds the lookback.
 */
const loadLastRecordedDateStates = async (accountId: string, countryCode: string) => {
    const rows = await db
        .selectDistinctOn([sql`${events.payload} ->> 'bucketDate'`], { payload: events.payload })
        .from(events)
        .where(
            and(
                eq(events.jobName, JOB_NAME),
                eq(events.accountId, accountId),
                eq(events.countryCode, countryCode),
                eq(events.outcome, 'ok'),
                gte(events.createdAt, new Date(Date.now() - EVENT_LOOKBACK_MS))
            )
        )
        .orderBy(sql`${events.payload} ->> 'bucketDate'`, desc(events.createdAt));

    const states = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
        const payload = row.payload as Record<string, unknown> | null;
        if (payload && typeof payload.bucketDate === 'string') {
            states.set(payload.bucketDate, payload);
        }
    }
    return states;
};

const describeResult = (result: DailyTargetRefreshResult) => {
    switch (result.outcome) {
        case 'derived-from-hourly':
            return `Derived {{badges}} from hourly (${REASON_LABELS[result.decision.reason]}). ${result.rowsDerived} rows, ${result.rowsChanged} changed, ${result.rowsRemoved} removed.`;
        case 'skipped-empty-hourly':
            return 'Kept {{badges}} from daily report (hourly is newer but has no rows).';
        default:
            return `Kept {{badges}} from daily report (${REASON_LABELS[result.decision.reason]}).`;
    }
};

const REASON_LABELS: Record<DailyTargetRefreshResult['decision']['reason'], string> = {
    'hourly-newer': 'newer than daily report',
    'no-daily-report': 'no daily report yet',
    'daily-newer': 'newer than hourly',
    'no-hourly-data': 'no hourly data',
};

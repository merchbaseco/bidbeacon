import { formatInTimeZone } from 'date-fns-tz';
import { getHourlyStreamOwnershipStart, zonedAddDays, zonedStartOfDay, zonedSubtractDays } from '@/utils/date';

/**
 * Today plus the two most recent closed dates. Older dates keep their daily report:
 * by then a T+3 daily report has been created at the same milestone as the hourly one.
 */
const FRESHNESS_WINDOW_DAYS = 3;
/** Without an AMS message stored this recently, Stream data is not treated as fresh. */
const STREAM_RECEIPT_MAX_AGE_MS = 30 * 60 * 1000;

type ReportFreshness = {
    lastReportCreatedAt: Date | null;
    lastProcessedReportId: string | null;
    reportId: string | null;
    status: string;
};

export type FreshnessDate = {
    bucketDate: string;
    periodStart: Date;
    periodEnd: Date;
};

export type DailyTargetSourceDecision = {
    source: 'hourly' | 'daily';
    reason: 'no-hourly-data' | 'no-daily-report' | 'hourly-newer' | 'daily-newer';
    hourlyAsOf: Date | null;
    dailyAsOf: Date | null;
    streamAsOf: Date | null;
    hourlyReportAsOf: Date | null;
};

/**
 * Account-local dates whose daily target rows may be re-derived from hourly data,
 * newest first. Boundaries come from the account-local calendar, so DST days are 23 or 25 hours.
 */
export const getFreshnessDates = (now: Date, timezone: string): FreshnessDate[] => {
    const todayStart = zonedStartOfDay(now, timezone);
    return Array.from({ length: FRESHNESS_WINDOW_DAYS }, (_, offset) => {
        const periodStart = zonedSubtractDays(todayStart, offset, timezone);
        return {
            bucketDate: formatInTimeZone(periodStart, timezone, 'yyyy-MM-dd'),
            periodStart,
            periodEnd: zonedAddDays(periodStart, 1, timezone),
        };
    });
};

/**
 * The instant Stream-derived hourly data reflects, or null when Stream cannot be trusted as fresh.
 * A successful rollup only proves the job ran; the data is as fresh as the older of the rollup start
 * and the latest AMS message actually stored for the advertiser. An account without an entity id
 * has no Stream, and no AMS message in the last 30 minutes means Stream is not fresh.
 */
export const resolveStreamAsOf = (input: { hasEntityId: boolean; rollupStartedAt: Date | null; latestReceivedAt: Date | null; now: Date }): Date | null => {
    if (!(input.hasEntityId && input.rollupStartedAt && input.latestReceivedAt)) {
        return null;
    }
    if (input.now.getTime() - input.latestReceivedAt.getTime() > STREAM_RECEIPT_MAX_AGE_MS) {
        return null;
    }
    return input.latestReceivedAt < input.rollupStartedAt ? input.latestReceivedAt : input.rollupStartedAt;
};

/**
 * Pick the most recently refreshed source for one account-local date.
 *
 * Freshness is the instant the data was observed, not when we parsed it: a report reflects
 * Amazon at its creation time, and Stream reflects what AMS had delivered by the rollup.
 *
 * - Hourly as-of is the later of the Stream as-of (see `resolveStreamAsOf`; only when the
 *   rollup's trailing window reaches into the date) and the creation time of the last processed hourly-grain report.
 *   An hourly report is only trusted while its metadata is settled (completed, nothing in
 *   flight), because otherwise `lastReportCreatedAt` belongs to a different report.
 * - Daily as-of is `lastReportCreatedAt` of the daily report. When a daily report is in
 *   flight this is an upper bound on the processed data, so a pending daily report newer than
 *   the hourly data stops derivation and the existing rows stay until it lands.
 *
 * Ties go to the daily report.
 */
export const chooseDailyTargetSource = (input: {
    period: Pick<FreshnessDate, 'periodEnd'>;
    daily: Pick<ReportFreshness, 'lastReportCreatedAt'> | null;
    hourly: ReportFreshness | null;
    streamRolledUpAt: Date | null;
    timezone: string;
}): DailyTargetSourceDecision => {
    const streamAsOf = input.streamRolledUpAt && input.period.periodEnd > getHourlyStreamOwnershipStart(input.streamRolledUpAt, input.timezone) ? input.streamRolledUpAt : null;
    const hourlyReportAsOf = getProcessedReportAsOf(input.hourly);
    const hourlyAsOf = latest(streamAsOf, hourlyReportAsOf);
    const dailyAsOf = input.daily?.lastReportCreatedAt ?? null;
    const decision = { hourlyAsOf, dailyAsOf, streamAsOf, hourlyReportAsOf };

    if (!hourlyAsOf) {
        return { source: 'daily', reason: 'no-hourly-data', ...decision };
    }
    if (!dailyAsOf) {
        return { source: 'hourly', reason: 'no-daily-report', ...decision };
    }
    if (hourlyAsOf > dailyAsOf) {
        return { source: 'hourly', reason: 'hourly-newer', ...decision };
    }
    return { source: 'daily', reason: 'daily-newer', ...decision };
};

const getProcessedReportAsOf = (report: ReportFreshness | null): Date | null => {
    if (!report?.lastProcessedReportId || report.reportId || report.status !== 'completed') {
        return null;
    }
    return report.lastReportCreatedAt;
};

const latest = (left: Date | null, right: Date | null): Date | null => {
    if (!left) {
        return right;
    }
    if (!right) {
        return left;
    }
    return left > right ? left : right;
};

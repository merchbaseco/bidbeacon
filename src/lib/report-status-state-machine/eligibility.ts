import { AGGREGATION_TYPES, type AggregationType } from '@/types/reports';
import { zonedAddDays, zonedAddHours } from '@/utils/date';
import { getTimezoneForCountry } from '@/utils/timezones';

const DAILY_REFRESH_DAYS = [1, 3, 5, 7, 14, 30, 60] as const;
const HOURLY_FIRST_DAY_HOURS = [3, 6, 9, 12, 15, 18, 21, 24] as const;

/**
 * Return the report refresh milestones as UTC instants on the account's local calendar.
 * Hourly-grain reports cover one local date, so their first milestone is three hours
 * after that date closes. The final milestone is three hours inside the 14-day limit.
 */
export const getRefreshSchedule = (periodStart: Date, aggregation: AggregationType, countryCode: string): Date[] => {
    const timezone = getTimezoneForCountry(countryCode);

    if (aggregation === 'daily') {
        return DAILY_REFRESH_DAYS.map(days => zonedAddDays(periodStart, days, timezone));
    }

    const dayClose = zonedAddDays(periodStart, 1, timezone);
    return [
        ...HOURLY_FIRST_DAY_HOURS.map(hours => zonedAddHours(dayClose, hours, timezone)),
        zonedAddDays(periodStart, 3, timezone),
        zonedAddDays(periodStart, 7, timezone),
        zonedAddHours(zonedAddDays(periodStart, 13, timezone), 21, timezone),
    ];
};

export const isEligibleForReport = (periodStart: Date, aggregation: AggregationType, lastReportCreatedAt: Date | null, countryCode: string, now: Date = new Date()): boolean => {
    if (!isAggregationType(aggregation)) {
        return false;
    }

    return getRefreshSchedule(periodStart, aggregation, countryCode).some(milestone => milestone <= now && (!lastReportCreatedAt || lastReportCreatedAt < milestone));
};

/**
 * Return the first refresh milestone not yet covered by a created report.
 * In-flight reports are polled every five minutes.
 */
export const getNextRefreshTime = (
    row: {
        reportId: string | null;
        periodStart: Date;
        aggregation: AggregationType | string;
        lastReportCreatedAt: Date | null;
        countryCode: string;
    },
    now: Date = new Date()
): Date | null => {
    if (row.reportId) {
        return new Date(now.getTime() + 5 * 60 * 1000);
    }

    if (!isAggregationType(row.aggregation)) {
        return null;
    }

    return getRefreshSchedule(row.periodStart, row.aggregation, row.countryCode).find(milestone => !row.lastReportCreatedAt || row.lastReportCreatedAt < milestone) ?? null;
};

const isAggregationType = (value: string | AggregationType): value is AggregationType => AGGREGATION_TYPES.includes(value as AggregationType);

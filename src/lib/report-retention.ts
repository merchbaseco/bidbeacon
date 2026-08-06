import { zonedStartOfDay, zonedSubtractDays } from '@/utils/date';

const HOURLY_RETENTION_DATE_COUNT = 14;
const PLACEMENT_RETENTION_DATE_COUNT = 90;

/**
 * Amazon exposes hourly-grain data for 14 account-local dates, including today.
 * Share the inclusive boundary between metadata creation and cleanup.
 */
export const getHourlyReportRetentionWindow = (now: Date, timezone: string) => {
    const latestPeriodStart = zonedStartOfDay(now, timezone);

    return {
        earliestPeriodStart: zonedSubtractDays(latestPeriodStart, HOURLY_RETENTION_DATE_COUNT - 1, timezone),
        latestPeriodStart,
    };
};

/**
 * Amazon exposes Sponsored Products placement reports for 90 account-local
 * dates, including today.
 */
export const getPlacementReportRetentionWindow = (now: Date, timezone: string) => {
    const latestPeriodStart = zonedStartOfDay(now, timezone);

    return {
        earliestPeriodStart: zonedSubtractDays(latestPeriodStart, PLACEMENT_RETENTION_DATE_COUNT - 1, timezone),
        latestPeriodStart,
    };
};

import { toZonedTime } from 'date-fns-tz';
import type { AggregationType } from '@/types/reports';
import { getTimezoneForCountry } from '@/utils/timezones';
import type { ReportDatum } from './types';

/**
 * Eligible time offsets for report refresh (in hours).
 * Daily reports use day offsets, hourly reports use hour offsets.
 */
export const ELIGIBLE_OFFSETS = {
    daily: [1, 3, 5, 7, 14, 30, 60].map(days => days * 24), // Convert days to hours
    hourly: [24, 72, 312],
} as const;

/**
 * Get eligible offsets for a given aggregation type.
 */
export function getEligibleOffsets(aggregation: AggregationType): readonly number[] {
    return ELIGIBLE_OFFSETS[aggregation];
}

/**
 * Check if a report datum is eligible for a new report creation.
 *
 * A datum is eligible if:
 * 1. The age (NOW - datum.timestamp) matches one of the eligible offsets
 * 2. No report was already created at this offset (lastReportCreatedAt hasn't been set at this offset)
 *
 * All comparisons happen in the country's local timezone.
 */
export function isEligibleForReport(datum: ReportDatum, countryCode: string, now: Date = new Date()): boolean {
    const timezone = getTimezoneForCountry(countryCode);

    // Convert UTC now to country's timezone
    const nowZoned = toZonedTime(now, timezone);

    // Calculate age in hours (both timestamps are in local timezone)
    const ageMs = nowZoned.getTime() - datum.timestamp.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    // Check if age matches any eligible offset
    const eligibleOffsets = getEligibleOffsets(datum.aggregation);
    const matchingOffset = eligibleOffsets.find(offset => {
        // Allow small tolerance for clock skew (±1 hour)
        return Math.abs(ageHours - offset) <= 1;
    });

    if (!matchingOffset) {
        return false;
    }

    // Check if a report was already created at this offset
    if (!datum.lastReportCreatedAt) {
        // No report created yet, so eligible
        return true;
    }

    // Calculate when the last report was created relative to the datum timestamp
    const lastCreatedAgeMs = datum.lastReportCreatedAt.getTime() - datum.timestamp.getTime();
    const lastCreatedAgeHours = Math.floor(lastCreatedAgeMs / (1000 * 60 * 60));

    // Check if lastReportCreatedAt was set at an offset >= current matching offset
    // If so, we've already created a report at this or a later offset
    return lastCreatedAgeHours < matchingOffset;
}

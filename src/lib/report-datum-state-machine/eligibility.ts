import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
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

    // Convert both timestamps to the country's timezone to get their local time representation
    const nowZoned = toZonedTime(now, timezone);
    const datumZoned = toZonedTime(datum.timestamp, timezone);

    // Calculate age in hours by comparing the local time representations
    // We compare the UTC milliseconds of the zoned times, which gives us the difference
    // in the country's local timezone
    const ageMs = nowZoned.getTime() - datumZoned.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    console.log(`[Eligibility] Checking eligibility for ${datum.aggregation} report:`, {
        timestamp: datum.timestamp.toISOString(),
        timestampZoned: datumZoned.toISOString(),
        timestampZonedFormatted: formatInTimeZone(datum.timestamp, timezone, 'yyyy-MM-dd HH:mm:ss'),
        now: now.toISOString(),
        nowZoned: nowZoned.toISOString(),
        nowZonedFormatted: formatInTimeZone(now, timezone, 'yyyy-MM-dd HH:mm:ss'),
        ageMs,
        ageHours,
        lastReportCreatedAt: datum.lastReportCreatedAt?.toISOString() ?? null,
        countryCode,
        timezone,
    });

    // Check if age matches any eligible offset
    const eligibleOffsets = getEligibleOffsets(datum.aggregation);
    console.log(`[Eligibility] Eligible offsets for ${datum.aggregation}:`, eligibleOffsets);

    const matchingOffset = eligibleOffsets.find(offset => {
        // Allow small tolerance for clock skew (±1 hour)
        return Math.abs(ageHours - offset) <= 1;
    });

    console.log(`[Eligibility] Matching offset:`, matchingOffset);

    if (!matchingOffset) {
        console.log(`[Eligibility] No matching offset found, not eligible`);
        return false;
    }

    // Check if a report was already created at this offset
    if (!datum.lastReportCreatedAt) {
        // No report created yet, so eligible
        console.log(`[Eligibility] No lastReportCreatedAt, eligible for creation`);
        return true;
    }

    // Calculate when the last report was created relative to the datum timestamp
    // Convert lastReportCreatedAt to country's timezone as well
    const lastCreatedZoned = toZonedTime(datum.lastReportCreatedAt, timezone);
    // Compare in the same timezone context
    const lastCreatedAgeMs = lastCreatedZoned.getTime() - datumZoned.getTime();
    const lastCreatedAgeHours = Math.floor(lastCreatedAgeMs / (1000 * 60 * 60));

    console.log(`[Eligibility] Last report created age:`, {
        lastCreatedAgeMs,
        lastCreatedAgeHours,
        matchingOffset,
    });

    // Check if lastReportCreatedAt was set at an offset >= current matching offset
    // If so, we've already created a report at this or a later offset
    const eligible = lastCreatedAgeHours < matchingOffset;
    console.log(`[Eligibility] Eligibility result: ${eligible} (lastCreatedAgeHours=${lastCreatedAgeHours} < matchingOffset=${matchingOffset})`);
    return eligible;
}

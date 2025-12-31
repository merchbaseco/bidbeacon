import { fromZonedTime } from 'date-fns-tz';
import { AGGREGATION_TYPES, type AggregationType } from '@/types/reports';
import { getTimezoneForCountry } from '@/utils/timezones';

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
 * 1. The age (NOW - timestamp) has reached or exceeded one of the eligible offsets
 * 2. No report was already created at this offset (lastReportCreatedAt was set before reaching this offset, or is null)
 *
 * The eligible offsets represent thresholds where the ads server likely has updated report data.
 * If we already fetched data at a threshold, we don't fetch it again.
 */
export function isEligibleForReport(timestamp: Date, aggregation: AggregationType, lastReportCreatedAt: Date | null, countryCode: string, now: Date = new Date()): boolean {
    // Calculate age in hours using UTC timestamps
    const ageMs = now.getTime() - timestamp.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    // Check if age matches any eligible offset
    const aggregationType = isAggregationType(aggregation) ? aggregation : null;
    if (!aggregationType) {
        return false;
    }
    const eligibleOffsets = getEligibleOffsets(aggregationType);

    // Find the highest eligible offset that the report age has reached or exceeded
    const sortedOffsets = [...eligibleOffsets].sort((a, b) => a - b);
    let matchingOffset: number | undefined;

    // Find the largest offset where ageHours >= offset
    // This means we've reached or passed this threshold
    for (let i = sortedOffsets.length - 1; i >= 0; i--) {
        const offset = sortedOffsets[i];
        if (ageHours >= offset) {
            matchingOffset = offset;
            break;
        }
    }

    if (!matchingOffset) {
        return false;
    }

    // Check if a report was already created at this offset
    const lastReportCreatedAtUtc = toUtcFromLocal(lastReportCreatedAt, countryCode);
    if (!lastReportCreatedAtUtc) {
        // No report created yet, so eligible (age is past threshold and no previous report)
        return true;
    }

    // Calculate when the last report was created relative to the datum timestamp (UTC)
    const lastCreatedAgeMs = lastReportCreatedAtUtc.getTime() - timestamp.getTime();
    const lastCreatedAgeHours = Math.floor(lastCreatedAgeMs / (1000 * 60 * 60));

    // Check if lastReportCreatedAt was set before reaching the matching offset
    // If lastCreatedAgeHours < matchingOffset, it means we created a report when the datum
    // was younger than the threshold, so we haven't created one at this threshold yet
    // If lastCreatedAgeHours >= matchingOffset, we already created a report at this or a later threshold
    return lastCreatedAgeHours < matchingOffset;
}

/**
 * Calculate the next refresh time for a report datum.
 *
 * Returns the timestamp when the next eligible refresh should occur, or null if
 * all eligible offsets have been reached and reports created.
 *
 * If a report is in-flight (reportId is non-null), returns a short poll interval (5 minutes).
 *
 * Can be called with a full row object or an object containing just the required fields.
 */
export function getNextRefreshTime(row: {
    reportId: string | null;
    periodStart: Date;
    aggregation: AggregationType | string;
    lastReportCreatedAt: Date | null;
    countryCode: string;
}): Date | null {
    const { reportId, periodStart, aggregation, lastReportCreatedAt, countryCode } = row;
    const now = new Date();

    // If a report is in-flight, poll in 5 minutes to check its status
    if (reportId) {
        return new Date(now.getTime() + 5 * 60 * 1000);
    }

    // Get all eligible offsets in hours.
    const aggregationType = isAggregationType(aggregation) ? aggregation : null;
    if (!aggregationType) {
        return null;
    }
    const eligibleOffsets = getEligibleOffsets(aggregationType);
    const sortedOffsets = [...eligibleOffsets].sort((a, b) => a - b);

    // Calculate current age in hours
    const ageMs = now.getTime() - periodStart.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    // Calculate last report created age if it exists
    const lastReportCreatedAtUtc = toUtcFromLocal(lastReportCreatedAt, countryCode);
    const lastCreatedAgeHours = lastReportCreatedAtUtc ? Math.floor((lastReportCreatedAtUtc.getTime() - periodStart.getTime()) / (1000 * 60 * 60)) : null;

    // Find the next offset that either:
    // 1. Hasn't been reached yet (ageHours < offset), OR
    // 2. Has been reached but no report was created at that offset yet
    for (const offset of sortedOffsets) {
        if (ageHours < offset) {
            // Offset hasn't been reached yet - next refresh is when we reach it
            return new Date(periodStart.getTime() + offset * 60 * 60 * 1000);
        }

        // Offset has been reached - check if report was created at this offset
        if (lastCreatedAgeHours === null || lastCreatedAgeHours < offset) {
            // No report created at this offset yet - next refresh is now (or when we reached it)
            // Return the timestamp when this offset was reached
            return new Date(periodStart.getTime() + offset * 60 * 60 * 1000);
        }
    }

    // All offsets have been reached and reports created - no more refreshes needed
    return null;
}

const toUtcFromLocal = (timestamp: Date | null, countryCode: string): Date | null => {
    if (!timestamp) {
        return null;
    }

    const timezone = getTimezoneForCountry(countryCode);
    return fromZonedTime(timestamp, timezone);
};

const isAggregationType = (value: string | AggregationType): value is AggregationType => {
    return AGGREGATION_TYPES.includes(value as AggregationType);
};

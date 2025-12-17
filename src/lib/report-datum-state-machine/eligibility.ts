import type { AggregationType } from '@/types/reports';
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
 * 1. The age (NOW - datum.timestamp) has reached or exceeded one of the eligible offsets
 * 2. No report was already created at this offset (lastReportCreatedAt was set before reaching this offset, or is null)
 *
 * The eligible offsets represent thresholds where the ads server likely has updated report data.
 * If we already fetched data at a threshold, we don't fetch it again.
 */
export function isEligibleForReport(datum: ReportDatum, _countryCode: string, now: Date = new Date()): boolean {
    // Calculate age in hours - timezone doesn't matter for relative comparisons
    const ageMs = now.getTime() - datum.timestamp.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    console.log(`[Eligibility] Checking eligibility for ${datum.aggregation} report:`, {
        timestamp: datum.timestamp.toISOString(),
        now: now.toISOString(),
        ageMs,
        ageHours,
        lastReportCreatedAt: datum.lastReportCreatedAt?.toISOString() ?? null,
    });

    // Check if age matches any eligible offset
    const eligibleOffsets = getEligibleOffsets(datum.aggregation);
    console.log(`[Eligibility] Eligible offsets for ${datum.aggregation}:`, eligibleOffsets);

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

    console.log(`[Eligibility] Matching offset:`, matchingOffset, `(ageHours=${ageHours})`);

    if (!matchingOffset) {
        console.log(`[Eligibility] No matching offset found (age ${ageHours}h is less than minimum offset ${sortedOffsets[0]}h), not eligible`);
        return false;
    }

    // Check if a report was already created at this offset
    if (!datum.lastReportCreatedAt) {
        // No report created yet, so eligible (age is past threshold and no previous report)
        console.log(`[Eligibility] No lastReportCreatedAt, eligible for creation at ${matchingOffset}h offset`);
        return true;
    }

    // Calculate when the last report was created relative to the datum timestamp
    // Timezone doesn't matter for relative comparisons
    const lastCreatedAgeMs = datum.lastReportCreatedAt.getTime() - datum.timestamp.getTime();
    const lastCreatedAgeHours = Math.floor(lastCreatedAgeMs / (1000 * 60 * 60));

    console.log(`[Eligibility] Last report created age:`, {
        lastCreatedAgeMs,
        lastCreatedAgeHours,
        matchingOffset,
    });

    // Check if lastReportCreatedAt was set before reaching the matching offset
    // If lastCreatedAgeHours < matchingOffset, it means we created a report when the datum
    // was younger than the threshold, so we haven't created one at this threshold yet
    // If lastCreatedAgeHours >= matchingOffset, we already created a report at this or a later threshold
    const eligible = lastCreatedAgeHours < matchingOffset;
    console.log(`[Eligibility] Eligibility result: ${eligible} (lastCreatedAgeHours=${lastCreatedAgeHours} < matchingOffset=${matchingOffset})`);
    return eligible;
}

import { retrieveReport } from '@/amazon-ads/retrieve-report.js';
import type { AggregationType } from '@/types/reports';
import { isEligibleForReport } from './eligibility';
import type { NextAction } from './types';

/**
 * Determine the next action to take for a report datum based on its state.
 *
 * State machine logic:
 * 1. If report exists AND status is COMPLETED → 'process'
 * 2. If report exists AND status is NOT COMPLETED → 'none'
 * 3. If no report AND eligible → 'create'
 * 4. If no report AND not eligible → 'none'
 *
 * @param timestamp - Report timestamp
 * @param aggregation - Report aggregation type
 * @param lastReportCreatedAt - Last time a report was created for this datum
 * @param reportId - Report ID if a report exists, null otherwise
 * @param countryCode - Country code for timezone calculations
 * @param now - Current time (defaults to new Date())
 * @returns The next action to take
 * @throws Error if reportId exists but report cannot be fetched
 */
export async function getNextAction(
    timestamp: Date,
    aggregation: AggregationType,
    lastReportCreatedAt: Date | null,
    reportId: string | null,
    countryCode: string,
    now: Date = new Date()
): Promise<NextAction> {
    // If reportId exists, fetch its status
    if (reportId) {
        const retrieveResponse = await retrieveReport(
            {
                reportIds: [reportId],
            },
            'na'
        );

        const report = retrieveResponse.success?.[0]?.report;
        if (!report) {
            throw new Error('Report not found in retrieve API response');
        }

        // Report exists - check its status
        if (report.status === 'COMPLETED') {
            return 'process';
        }
        // Report exists but not ready
        return 'none';
    }

    // No report - check eligibility
    if (isEligibleForReport(timestamp, aggregation, lastReportCreatedAt, countryCode, now)) {
        return 'create';
    }

    // Not eligible
    return 'none';
}

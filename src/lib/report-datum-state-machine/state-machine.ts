import { isEligibleForReport } from './eligibility';
import type { NextAction, ReportDatum, ReportStatus } from './types';

/**
 * Determine the next action to take for a report datum based on its state.
 *
 * State machine logic:
 * 1. If report exists AND status is COMPLETED → 'process'
 * 2. If report exists AND status is NOT COMPLETED → 'none'
 * 3. If no report AND eligible → 'create'
 * 4. If no report AND not eligible → 'none'
 */
export function getNextAction(datum: ReportDatum, reportStatus: ReportStatus | null, countryCode: string, now: Date = new Date()): NextAction {
    // If report exists, check its status
    if (datum.reportId && reportStatus) {
        if (reportStatus.status === 'COMPLETED') {
            return 'process';
        }
        // Report exists but not ready
        return 'none';
    }

    // No report - check eligibility
    if (isEligibleForReport(datum, countryCode, now)) {
        return 'create';
    }

    // Not eligible
    return 'none';
}

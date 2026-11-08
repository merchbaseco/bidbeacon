import type { DailyTargetRefreshResult } from './refresh-daily-target-performance';

type RecordedDateState = { outcome?: unknown; reason?: unknown; rowsDerived?: unknown };

/**
 * The state a per-date refresh event records. A new event is only worth writing when the
 * chosen source (outcome and reason) or the derived row count differs from the last one.
 */
export const toRecordedDateState = (result: Pick<DailyTargetRefreshResult, 'outcome' | 'rowsDerived' | 'decision'>) => ({
    outcome: result.outcome,
    reason: result.decision.reason,
    rowsDerived: result.rowsDerived,
});

export const hasDateStateChanged = (previous: RecordedDateState | undefined, current: ReturnType<typeof toRecordedDateState>) =>
    !previous || previous.outcome !== current.outcome || previous.reason !== current.reason || Number(previous.rowsDerived) !== current.rowsDerived;

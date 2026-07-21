import type { AggregationType, EntityType } from '@/types/reports';

/**
 * Report datum from the database.
 * Represents a single report metadata record.
 */
export interface ReportDatum {
    accountId: string;
    countryCode: string;
    timestamp: Date;
    aggregation: AggregationType;
    entityType: EntityType;
    status: string; // missing, fetching, parsing, completed, failed
    nextRefreshAt: Date | null;
    lastReportCreatedAt: Date | null;
    reportId: string | null;
    error: string | null;
}

/**
 * Report status from the retrieve API.
 */
export interface ReportStatus {
    status: string; // e.g., 'COMPLETED', 'IN_PROGRESS', 'FAILED'
}

/**
 * Next action to take for a report datum.
 */
export type NextAction = 'process' | 'create' | 'fail' | 'none';

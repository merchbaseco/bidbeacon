import type { AggregationType, EntityType } from '@/types/reports';

/**
 * Report datum from the database.
 * Represents a single report metadata record.
 */
export interface ReportDatum {
    accountId: string;
    countryCode: string;
    timestamp: Date; // timezone-less, represents local time in country's timezone
    aggregation: AggregationType;
    entityType: EntityType;
    status: string; // missing, fetching, completed, failed
    lastRefreshed: Date | null;
    lastReportCreatedAt: Date | null; // timezone-less, represents local time in country's timezone
    reportId: string | null;
    error: string | null;
}

/**
 * Report status from the retrieve API.
 */
export interface ReportStatus {
    status: string; // e.g., 'COMPLETED', 'IN_PROGRESS', 'FAILED'
    completedReportParts?: Array<{ url?: string }> | null;
}

/**
 * Next action to take for a report datum.
 */
export type NextAction = 'process' | 'create' | 'none';

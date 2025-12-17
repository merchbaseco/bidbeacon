import { emitEvent } from './events.js';

type ReportDatasetMetadataRow = {
    accountId: string;
    countryCode: string;
    timestamp: Date;
    aggregation: string;
    entityType: string;
    status: string;
    refreshing: boolean;
    lastRefreshed: Date | null;
    lastReportCreatedAt: Date | null;
    reportId: string | null;
    error: string | null;
};

/**
 * Helper function to emit a report-dataset-metadata:updated event
 * Takes the updated row data and emits the event
 */
export function emitReportDatasetMetadataUpdated(row: ReportDatasetMetadataRow) {
    emitEvent({
        type: 'report-dataset-metadata:updated',
        data: {
            accountId: row.accountId,
            countryCode: row.countryCode,
            timestamp: row.timestamp.toISOString(),
            aggregation: row.aggregation as 'hourly' | 'daily',
            entityType: row.entityType as 'target' | 'product',
            status: row.status,
            refreshing: row.refreshing,
            lastRefreshed: row.lastRefreshed?.toISOString() ?? null,
            lastReportCreatedAt: row.lastReportCreatedAt?.toISOString() ?? null,
            reportId: row.reportId ?? null,
            error: row.error ?? null,
        },
    });
}

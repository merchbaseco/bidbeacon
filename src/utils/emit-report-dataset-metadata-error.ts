import { emitEvent } from './events.js';

/**
 * Helper function to emit a report-dataset-metadata:error event
 * Takes the error information and emits the event
 */
export function emitReportDatasetMetadataError(args: {
    accountId: string;
    countryCode: string;
    periodStart: Date;
    aggregation: 'hourly' | 'daily';
    entityType: 'target' | 'product';
    error: string;
}): void {
    emitEvent({
        type: 'report-dataset-metadata:error',
        data: {
            accountId: args.accountId,
            countryCode: args.countryCode,
            periodStart: args.periodStart.toISOString(),
            aggregation: args.aggregation,
            entityType: args.entityType,
            error: args.error,
        },
    });
}


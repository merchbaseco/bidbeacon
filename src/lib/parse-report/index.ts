import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { reportDatasetMetadata } from '@/db/schema';
import type { AggregationType, EntityType } from '@/types/reports';
import { handleDailyProduct } from './handlers/daily-product';
import { handleDailyTarget } from './handlers/daily-target';
import { handleHourlyProduct } from './handlers/hourly-product';
import { handleHourlyTarget } from './handlers/hourly-target';
import { validateReportReady } from './validate-report-ready';

export type ParseReportInput = {
    accountId: string;
    countryCode: string;
    timestamp: string;
    aggregation: AggregationType;
    entityType: EntityType;
};

export async function parseReport(input: ParseReportInput): Promise<{ rowsProcessed: number }> {
    // Validate report is ready to be processed
    const reportMetadata = await validateReportReady(input);

    // Farm out processing to the appropriate handler
    const handler = getHandler(input.aggregation, input.entityType);
    const result = await handler(input, reportMetadata);

    // Update report metadata status
    const date = new Date(input.timestamp);
    await db
        .update(reportDatasetMetadata)
        .set({
            status: 'completed',
            error: null,
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, input.accountId),
                eq(reportDatasetMetadata.timestamp, date),
                eq(reportDatasetMetadata.aggregation, input.aggregation),
                eq(reportDatasetMetadata.entityType, input.entityType)
            )
        );

    return result;
}

function getHandler(aggregation: 'hourly' | 'daily', entityType: 'target' | 'product') {
    if (aggregation === 'hourly' && entityType === 'target') {
        return handleHourlyTarget;
    }
    if (aggregation === 'hourly' && entityType === 'product') {
        return handleHourlyProduct;
    }
    if (aggregation === 'daily' && entityType === 'target') {
        return handleDailyTarget;
    }
    if (aggregation === 'daily' && entityType === 'product') {
        return handleDailyProduct;
    }
    throw new Error(`No handler found for aggregation: ${aggregation}, entityType: ${entityType}`);
}

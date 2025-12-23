import { eq, type InferSelectModel } from 'drizzle-orm';
import { reportConfigs } from '@/config/reports/configs';
import { db } from '@/db';
import { reportDatasetMetadata } from '@/db/schema';
import { handleDailyProduct } from './handlers/daily-product';
import { handleDailyTarget } from './handlers/daily-target';
import { handleHourlyProduct } from './handlers/hourly-product';
import { handleHourlyTarget } from './handlers/hourly-target';
import type { ParseReportInput, ParseReportOutput } from './handlers/input';
import { validateReportReady } from './validate-report-ready';

export async function parseReport(reportUid: InferSelectModel<typeof reportDatasetMetadata>['uid']): Promise<ParseReportOutput> {
    const reportMetadata = await db.query.reportDatasetMetadata.findFirst({
        where: eq(reportDatasetMetadata.uid, reportUid),
    });

    if (!reportMetadata) {
        throw new Error(`Report metadata not found.`);
    }

    if (!reportMetadata.reportId) {
        throw new Error('No reportId found for this report. Create the report first.');
    }

    // Validate report is ready to be processed
    const reportUrl = await validateReportReady(reportMetadata.reportId);

    // Farm out processing to the appropriate handler
    const aggregation = reportMetadata.aggregation as 'hourly' | 'daily';
    const entityType = reportMetadata.entityType as 'target' | 'product';
    const reportConfig = reportConfigs[aggregation][entityType];

    const input: ParseReportInput = {
        reportUid: reportMetadata.uid,
        accountId: reportMetadata.accountId,
        periodStart: reportMetadata.periodStart,
        countryCode: reportMetadata.countryCode,
        reportConfig,
        reportUrl,
    };

    switch (`${aggregation}-${entityType}`) {
        case 'hourly-target':
            return handleHourlyTarget(input);
        case 'daily-target':
            return handleDailyTarget(input);
        case 'hourly-product':
            return handleHourlyProduct(input);
        case 'daily-product':
            return handleDailyProduct(input);
    }

    throw new Error(`No handler found for aggregation: ${aggregation}, entityType: ${entityType}`);
}

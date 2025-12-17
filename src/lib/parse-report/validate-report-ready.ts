import { and, eq } from 'drizzle-orm';
import { retrieveReport } from '@/amazon-ads/retrieve-report';
import { db } from '@/db/index';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema';
import type { ParseReportInput } from './index';

export interface ReportMetadata {
    accountId: string;
    countryCode: string;
    profileId: string;
    reportId: string;
    reportUrl: string;
}

export async function validateReportReady(input: ParseReportInput): Promise<ReportMetadata> {
    const date = new Date(input.timestamp);

    // Validate account exists
    const account = await db.query.advertiserAccount.findFirst({
        where: eq(advertiserAccount.adsAccountId, input.accountId),
        columns: {
            adsAccountId: true,
            profileId: true,
        },
    });

    if (!account) {
        throw new Error('Advertiser account not found');
    }

    if (!account.profileId) {
        throw new Error('Profile ID not found for this account');
    }

    // Validate report metadata exists
    const metadata = await db.query.reportDatasetMetadata.findFirst({
        where: and(
            eq(reportDatasetMetadata.accountId, input.accountId),
            eq(reportDatasetMetadata.timestamp, date),
            eq(reportDatasetMetadata.aggregation, input.aggregation),
            eq(reportDatasetMetadata.entityType, input.entityType)
        ),
    });

    if (!metadata) {
        throw new Error('Report metadata not found');
    }

    if (!metadata.reportId) {
        throw new Error('No reportId found for this report. Create the report first.');
    }

    // Retrieve report and validate it's ready
    const retrieveResponse = await retrieveReport(
        {
            reportIds: [metadata.reportId],
        },
        'na'
    );

    const report = retrieveResponse.success?.[0]?.report;
    if (!report) {
        throw new Error('Report not found in retrieve response');
    }

    if (report.status !== 'COMPLETED') {
        throw new Error(`Report is not ready. Current status: ${report.status}`);
    }

    // Extract URL from completedReportParts array (even if there's only 1 part)
    let reportUrl: string | null | undefined;
    if (report.completedReportParts && report.completedReportParts.length > 0) {
        reportUrl = report.completedReportParts[0].url;
    } else {
        // Fallback to legacy url field for backward compatibility
        reportUrl = report.url;
    }

    if (!reportUrl) {
        throw new Error('No URL found in report');
    }

    return {
        accountId: input.accountId,
        countryCode: metadata.countryCode,
        profileId: account.profileId,
        reportId: metadata.reportId,
        reportUrl,
    };
}

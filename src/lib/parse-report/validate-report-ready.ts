import { and, eq } from 'drizzle-orm';
import { retrieveReport } from '@/amazon-ads/retrieve-report';
import { db } from '@/db/index';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema';
import type { ParseReportInput } from './index';

export interface ReportMetadata {
    accountId: string;
    profileId: string;
    reportId: string;
    reportUrl: string;
}

export async function validateReportReady(input: ParseReportInput): Promise<ReportMetadata> {
    const date = new Date(input.timestamp);

    // Validate account exists and has profileId
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
            profileId: Number(account.profileId),
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

    const reportParts = report.completedReportParts;
    if (!reportParts || reportParts.length === 0) {
        throw new Error('No completed report parts found');
    }

    const reportUrl = reportParts[0]?.url;
    if (!reportUrl) {
        throw new Error('No URL found in report parts');
    }

    return {
        accountId: input.accountId,
        profileId: account.profileId,
        reportId: metadata.reportId,
        reportUrl,
    };
}

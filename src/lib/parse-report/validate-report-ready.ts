import { retrieveReport } from '@/amazon-ads/retrieve-report';

export async function validateReportReady(reportId: string): Promise<string> {
    // Retrieve report and validate it's ready
    const retrieveResponse = await retrieveReport(
        {
            reportIds: [reportId],
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

    return reportUrl;
}

import type { ReportConfig } from '@/types/reports';

export type ParseReportInput = {
    reportUid: string;
    accountId: string;
    periodStart: Date;
    reportConfig: ReportConfig;
    countryCode: string;
    reportUrl: string;
};

export type ParseReportOutput = {
    successCount: number;
    errorCount: number;
    rowsProcessed: number;
};

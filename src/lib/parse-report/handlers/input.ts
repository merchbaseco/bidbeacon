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
    changedCount: number;
    /** Daily target rows removed because the report no longer contains them. */
    removedCount?: number;
    errorCount: number;
    rowsProcessed: number;
    errorSamples: string[];
};

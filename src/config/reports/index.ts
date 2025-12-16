import { dailyReportConfig } from './daily.js';
import { hourlyReportConfig } from './hourly.js';
import type { ReportConfig, ReportConfigMap } from '@/types/reports.js';

/**
 * Map of aggregation type to report configuration.
 * Use this to get the appropriate config based on aggregation type.
 */
export const reportConfigs: ReportConfigMap = {
    hourly: hourlyReportConfig,
    daily: dailyReportConfig,
};

/**
 * Get report configuration by aggregation type.
 */
export function getReportConfig(aggregation: 'hourly' | 'daily'): ReportConfig {
    return reportConfigs[aggregation];
}

// Re-export individual configs for direct imports
export { dailyReportConfig } from './daily.js';
export { hourlyReportConfig } from './hourly.js';


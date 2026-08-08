/**
 * Centralized report configuration map.
 * Maps aggregation -> entityType -> ReportConfig
 */

import type { ReportConfigMap } from '@/types/reports.js';
import { dailyTargetReportConfig } from './daily-target.js';
import { hourlyTargetReportConfig } from './hourly-target.js';

export const reportConfigs: ReportConfigMap = {
    hourly: {
        target: hourlyTargetReportConfig,
    },
    daily: {
        target: dailyTargetReportConfig,
    },
};

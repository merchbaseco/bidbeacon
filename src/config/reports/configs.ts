/**
 * Centralized report configuration map.
 * Maps aggregation -> entityType -> ReportConfig
 */

import type { ReportConfigMap } from '@/types/reports.js';
import { dailyProductReportConfig } from './daily-product.js';
import { dailyTargetReportConfig } from './daily-target.js';
import { hourlyProductReportConfig } from './hourly-product.js';
import { hourlyTargetReportConfig } from './hourly-target.js';

export const reportConfigs: ReportConfigMap = {
    hourly: {
        target: hourlyTargetReportConfig,
        product: hourlyProductReportConfig,
    },
    daily: {
        target: dailyTargetReportConfig,
        product: dailyProductReportConfig,
    },
};

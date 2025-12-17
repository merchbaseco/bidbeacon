import { z } from 'zod';
import type { ReportConfig } from '@/types/reports.js';

/**
 * Hourly report configuration.
 *
 * Hourly reports capture performance data at an hourly granularity.
 * Uses 'hour.value' for time dimension.
 */

// Complete schema for hourly report rows
const hourlyReportRowSchema = z.object({
    'hour.value': z.string(),
    'budgetCurrency.value': z.string(),
    'campaign.id': z.coerce.string(),
    'campaign.name': z.string(),
    'adGroup.id': z.coerce.string(),
    'adGroup.name': z.coerce.string(),
    'ad.id': z.coerce.string(),
    'target.value': z.string(),
    'target.matchType': z.string(),
    'searchTerm.value': z.string(),
    'matchedTarget.value': z.string(),
    'metric.impressions': z.number(),
    'metric.clicks': z.number(),
    'metric.purchases': z.number(),
    'metric.sales': z.number(),
    'metric.totalCost': z.number(),
});

// Derive fields array from schema keys
const fields = Object.keys(hourlyReportRowSchema.shape) as string[];

export const hourlyTargetReportConfig: ReportConfig = {
    aggregation: 'hourly',
    entityType: 'target',
    fields,
    rowSchema: hourlyReportRowSchema,
    format: 'GZIP_JSON',
};

import { z } from 'zod';
import type { ReportConfig } from '@/types/reports.js';

/**
 * Daily report configuration.
 *
 * Daily reports capture performance data at a daily granularity.
 * Uses 'date.value' for time dimension.
 */

// Complete schema for daily report rows
export const dailyReportRowSchema = z.object({
    'date.value': z.string(),
    'budgetCurrency.value': z.string(),
    'campaign.id': z.coerce.string(),
    'campaign.name': z.string(),
    'adGroup.id': z.coerce.string(),
    'adGroup.name': z.coerce.string(),
    'ad.id': z.coerce.string(),
    'target.value': z.string(),
    'target.matchType': z.string(),
    'searchTerm.value': z.string(),
    'metric.impressions': z.number(),
    'metric.clicks': z.number(),
    'metric.purchases': z.number(),
    'metric.sales': z.number(),
    'metric.totalCost': z.number(),
});

// Derive fields array from schema keys
const fields = Object.keys(dailyReportRowSchema.shape) as string[];

export const dailyTargetReportConfig: ReportConfig = {
    aggregation: 'daily',
    entityType: 'target',
    fields,
    rowSchema: dailyReportRowSchema,
    format: 'GZIP_JSON',
};

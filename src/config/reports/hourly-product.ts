import { z } from 'zod';
import type { ReportConfig } from '@/types/reports.js';

/**
 * Hourly report configuration.
 *
 * Hourly reports capture performance data at an hourly granularity.
 * Uses 'hour.value' for time dimension.
 */

// Complete schema for hourly report rows
export const hourlyReportRowSchema = z.object({
    'hour.value': z.coerce.string(),
    'budgetCurrency.value': z.string(),
    'campaign.id': z.coerce.string(),
    'campaign.name': z.string(),
    'adGroup.id': z.coerce.string(),
    'ad.id': z.coerce.string(),
    'advertisedProduct.id': z.string(),
    'advertisedProduct.marketplace': z.string(),
    'target.value': z.string(),
    'target.matchType': z.string(),
    'matchedTarget.value': z.string(),
    'metric.impressions': z.number(),
    'metric.clicks': z.number(),
    'metric.purchases': z.number(),
    'metric.sales': z.number(),
    'metric.totalCost': z.number(),
});

// Derive fields array from schema keys
const fields = Object.keys(hourlyReportRowSchema.shape) as string[];

export const hourlyProductReportConfig: ReportConfig = {
    aggregation: 'hourly',
    entityType: 'product',
    fields,
    rowSchema: hourlyReportRowSchema,
    format: 'GZIP_JSON',
};

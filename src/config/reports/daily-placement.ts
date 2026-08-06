import { z } from 'zod';
import type { ReportConfig } from '@/types/reports';

/**
 * Daily Sponsored Products Campaign-placement report.
 *
 * The report's placement dimension is normalized after parsing. Keeping the
 * source value as a string here lets the handler record unknown values as
 * parse errors instead of silently assigning them to a public bucket.
 */
export const dailyPlacementReportRowSchema = z.object({
    'date.value': z.string(),
    'campaign.id': z.coerce.string(),
    'placement.value': z.string(),
    'metric.impressions': z.number(),
    'metric.clicks': z.number(),
    'metric.purchases': z.number(),
    'metric.sales': z.number(),
    'metric.totalCost': z.number(),
});

const fields = Object.keys(dailyPlacementReportRowSchema.shape) as string[];

export const dailyPlacementReportConfig: ReportConfig = {
    aggregation: 'daily',
    entityType: 'placement',
    fields,
    rowSchema: dailyPlacementReportRowSchema,
    format: 'GZIP_JSON',
};

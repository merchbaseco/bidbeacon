import type { z } from 'zod';

// ============================================================================
// Report Configuration Types
// ============================================================================

/**
 * Configuration for a report type (hourly or daily).
 */
export interface ReportConfig {
    /** The aggregation type */
    aggregation: 'hourly' | 'daily';

    /** Fields to request from the Amazon Ads API (derived from schema keys) */
    fields: string[];

    /** Zod schema for parsing the report response */
    rowSchema: z.ZodSchema<any>;

    /** Report format (currently only GZIP_JSON is supported) */
    format: 'GZIP_JSON';
}

/**
 * Map of aggregation type to report configuration.
 */
export type ReportConfigMap = {
    hourly: ReportConfig;
    daily: ReportConfig;
};

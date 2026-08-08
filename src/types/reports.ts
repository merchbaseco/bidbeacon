import type { z } from 'zod';

// ============================================================================
// Report Configuration Types
// ============================================================================

export const AGGREGATION_TYPES = ['hourly', 'daily'] as const;
export type AggregationType = (typeof AGGREGATION_TYPES)[number];

export const ENTITY_TYPES = ['target', 'product'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * Configuration for a report type.
 */
export interface ReportConfig {
    /** The aggregation type */
    aggregation: AggregationType;

    /** The entity type */
    entityType: EntityType;

    /** Fields to request from the Amazon Ads API (derived from schema keys) */
    fields: string[];

    /** Zod schema for parsing the report response */
    rowSchema: z.ZodSchema<any>;

    /** Report format (currently only GZIP_JSON is supported) */
    format: 'GZIP_JSON';
}

/**
 * Map of aggregation -> entityType -> report configuration.
 */
export type ReportConfigMap = Record<AggregationType, Record<EntityType, ReportConfig>>;

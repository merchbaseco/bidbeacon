/**
 * Amazon Ads API - Create Report Bridge
 * Handles creating reports via the Amazon Ads API
 */

import { z } from 'zod';
import { withTracking } from '@/utils/api-tracker.js';
import { type ApiRegion, getApiBaseUrl } from './config.js';
import { refreshAccessToken } from './reauth.js';
import { throttledFetch } from './throttled-fetch.js';

// ============================================================================
// Schemas
// ============================================================================

const datePeriodSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
});

const periodSchema = z.object({
    datePeriod: datePeriodSchema,
});

const reportQuerySchema = z.object({
    fields: z.array(z.string()),
    filter: z.unknown().nullable().optional(),
});

const reportRequestSchema = z.object({
    format: z.string(), // e.g., "CSV"
    periods: z.array(periodSchema),
    query: reportQuerySchema,
    formatOptions: z.unknown().optional(),
});

const accessRequestedAccountSchema = z.object({
    advertiserAccountId: z.string(),
});

const createReportRequestSchema = z.object({
    accessRequestedAccounts: z.array(accessRequestedAccountSchema),
    reports: z.array(reportRequestSchema),
});

// Response schemas
const linkedAccountSchema = z.object({
    advertiserAccountId: z.string(),
});

const reportResponseSchema = z.object({
    reportId: z.string(),
    status: z.string(), // e.g., "PENDING"
    creationDateTime: z.string(), // ISO datetime
    lastUpdatedDateTime: z.string(), // ISO datetime
    format: z.string(),
    periods: z.array(periodSchema),
    query: reportQuerySchema,
    linkedAccounts: z.array(linkedAccountSchema),
    completedDateTime: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    currencyOfView: z.string().nullable().optional(),
    failureCode: z.string().nullable().optional(),
    failureReason: z.string().nullable().optional(),
    formatOptions: z.unknown().nullable().optional(),
    locale: z.string().nullable().optional(),
    timeZoneMode: z.string().nullable().optional(),
});

const successItemSchema = z.object({
    index: z.number().int(),
    report: reportResponseSchema,
});

const createReportResponseSchema = z.object({
    error: z.unknown().nullable(),
    success: z.array(successItemSchema),
});

// ============================================================================
// Types
// ============================================================================

export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;
export type CreateReportResponse = z.infer<typeof createReportResponseSchema>;
export type ReportResponse = z.infer<typeof reportResponseSchema>;
export type DatePeriod = z.infer<typeof datePeriodSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export interface CreateReportOptions {
    accessRequestedAccounts: Array<{ advertiserAccountId: string }>;
    reports: Array<{
        format: string;
        periods: Array<{
            datePeriod: {
                startDate: string; // YYYY-MM-DD
                endDate: string; // YYYY-MM-DD
            };
        }>;
        query: {
            fields: string[];
            filter?: unknown;
        };
        formatOptions?: unknown;
    }>;
}

// ============================================================================
// API Bridge Function
// ============================================================================

/**
 * Creates a report via the Amazon Ads API
 * @param options - Request options including accessRequestedAccounts and reports
 * @param region - API region (default: 'na' for North America)
 * @returns The created report response
 */
export async function createReport(options: CreateReportOptions, region: ApiRegion = 'na'): Promise<CreateReportResponse> {
    return withTracking({ apiName: 'createReport', region }, async () => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}/adsApi/v1/create/reports`;

        // Build request body
        const requestBody: CreateReportRequest = {
            accessRequestedAccounts: options.accessRequestedAccounts,
            reports: options.reports,
        };

        // Validate request body
        const validatedRequestBody = createReportRequestSchema.parse(requestBody);

        const headers: Record<string, string> = {
            'Amazon-Advertising-API-ClientId': clientId,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };

        const response = await throttledFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(validatedRequestBody),
            signal: AbortSignal.timeout(30000),
        });

        // Store status code for tracking (even if error)
        const statusCode = response.status;

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to create report: ${response.status} ${response.statusText}. ${errorText}`);
            // Attach status code to error for tracking
            (error as Error & { statusCode?: number }).statusCode = statusCode;
            throw error;
        }

        const jsonData = await response.json();
        const result = createReportResponseSchema.parse(jsonData);
        // Attach status code to result for tracking
        (result as typeof result & { statusCode?: number }).statusCode = statusCode;
        return result;
    });
}

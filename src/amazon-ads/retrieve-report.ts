/**
 * Amazon Ads API - Retrieve Report Bridge
 * Handles retrieving reports via the Amazon Ads API
 */

import { z } from 'zod';
import { refreshAccessToken } from './reauth.js';

export type ApiRegion = 'na' | 'eu' | 'fe';

function getApiBaseUrl(region: ApiRegion = 'na'): string {
    const baseUrls: Record<ApiRegion, string> = {
        na: 'https://advertising-api.amazon.com',
        eu: 'https://advertising-api-eu.amazon.com',
        fe: 'https://advertising-api-fe.amazon.com',
    };
    return baseUrls[region];
}

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

const completedReportPartSchema = z.object({
    sizeInBytes: z.number().int(),
    url: z.string().url(),
    urlExpirationDateTime: z.string(), // ISO datetime
});

const linkedAccountSchema = z.object({
    advertiserAccountId: z.string(),
});

const reportResponseSchema = z.object({
    reportId: z.string(),
    status: z.string(), // e.g., "PENDING", "COMPLETED"
    creationDateTime: z.string(), // ISO datetime
    lastUpdatedDateTime: z.string(), // ISO datetime
    format: z.string(),
    periods: z.array(periodSchema),
    query: reportQuerySchema,
    linkedAccounts: z.array(linkedAccountSchema),
    completedDateTime: z.string().nullable().optional(),
    completedReportParts: z.array(completedReportPartSchema).nullable().optional(),
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

const retrieveReportRequestSchema = z.object({
    reportIds: z.array(z.string()).min(1),
});

const retrieveReportResponseSchema = z.object({
    error: z.unknown().nullable(),
    success: z.array(successItemSchema),
});

// ============================================================================
// Types
// ============================================================================

export type RetrieveReportRequest = z.infer<typeof retrieveReportRequestSchema>;
export type RetrieveReportResponse = z.infer<typeof retrieveReportResponseSchema>;
export type ReportResponse = z.infer<typeof reportResponseSchema>;
export type CompletedReportPart = z.infer<typeof completedReportPartSchema>;
export type DatePeriod = z.infer<typeof datePeriodSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export interface RetrieveReportOptions {
    profileId: number; // Required for Amazon-Advertising-API-Scope header
    reportIds: string[];
}

// ============================================================================
// API Bridge Function
// ============================================================================

/**
 * Retrieves reports via the Amazon Ads API
 * @param options - Request options including profileId and reportIds
 * @param region - API region (default: 'na' for North America)
 * @returns The retrieved report response
 */
export async function retrieveReport(options: RetrieveReportOptions, region: ApiRegion = 'na'): Promise<RetrieveReportResponse> {
    const accessToken = await refreshAccessToken();
    const clientId = process.env.ADS_API_CLIENT_ID;

    if (!clientId) {
        throw new Error('Missing ADS_API_CLIENT_ID environment variable');
    }

    const baseUrl = getApiBaseUrl(region);
    const url = `${baseUrl}/adsApi/v1/retrieve/reports`;

    // Build request body
    const requestBody: RetrieveReportRequest = {
        reportIds: options.reportIds,
    };

    // Validate request body
    const validatedRequestBody = retrieveReportRequestSchema.parse(requestBody);

    const headers: Record<string, string> = {
        'Amazon-Advertising-API-ClientId': clientId,
        'Amazon-Advertising-API-Scope': String(options.profileId),
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(validatedRequestBody),
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to retrieve report: ${response.status} ${response.statusText}. ${errorText}`);
    }

    const jsonData = await response.json();
    return retrieveReportResponseSchema.parse(jsonData);
}

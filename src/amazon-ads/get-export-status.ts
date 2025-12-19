/**
 * Amazon Ads API - Get Export Status Bridge
 * Handles retrieving the status of export requests via the Amazon Ads API
 */

import { z } from 'zod';
import { withTracking } from '@/utils/api-tracker.js';
import { type ApiRegion, getApiBaseUrl } from './config.js';
import { refreshAccessToken } from './reauth.js';
import { throttledFetch } from './throttled-fetch.js';

// ============================================================================
// Schemas
// ============================================================================

const exportResponseSchema = z.object({
    exportId: z.string(),
    status: z.enum(['COMPLETED', 'FAILED', 'PROCESSING']),
    createdAt: z.string().datetime().optional(),
    generatedAt: z.string().datetime().optional(),
    url: z.string().url().optional(),
    urlExpiresAt: z.string().datetime().optional(),
    fileSize: z.number().optional(),
    error: z
        .object({
            errorCode: z.enum(['INTERNAL_ERROR', 'TIMED_OUT']).optional(),
            message: z.string(),
        })
        .optional(),
});

// ============================================================================
// Types
// ============================================================================

export type ExportStatusResponse = z.infer<typeof exportResponseSchema>;

export type ExportContentType = 'application/vnd.campaignsexport.v1+json' | 'application/vnd.adgroupsexport.v1+json' | 'application/vnd.adsexport.v1+json' | 'application/vnd.targetsexport.v1+json';

export interface GetExportStatusOptions {
    profileId: number; // Required for Amazon-Advertising-API-Scope header
    exportId: string;
    contentType: ExportContentType; // Must match the content type used to create the export
}

// ============================================================================
// API Bridge Function
// ============================================================================

/**
 * Gets the status of an export request via the Amazon Ads API
 * @param options - Request options including profileId, exportId, and contentType
 * @param region - API region (default: 'na' for North America)
 * @returns The export status response
 */
export async function getExportStatus(options: GetExportStatusOptions, region: ApiRegion = 'na'): Promise<ExportStatusResponse> {
    return withTracking({ apiName: 'getExportStatus', region }, async () => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}/exports/${encodeURIComponent(options.exportId)}`;

        const headers: Record<string, string> = {
            'Amazon-Advertising-API-ClientId': clientId,
            'Amazon-Advertising-API-Scope': String(options.profileId),
            Authorization: `Bearer ${accessToken}`,
            Accept: options.contentType,
        };

        const response = await throttledFetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(30000),
        });

        // Store status code for tracking (even if error)
        const statusCode = response.status;

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to get export status: ${response.status} ${response.statusText}. ${errorText}`);
            // Attach status code to error for tracking
            (error as Error & { statusCode?: number }).statusCode = statusCode;
            throw error;
        }

        const jsonData = await response.json();
        const result = exportResponseSchema.parse(jsonData);
        // Attach status code to result for tracking
        (result as typeof result & { statusCode?: number }).statusCode = statusCode;
        return result;
    });
}

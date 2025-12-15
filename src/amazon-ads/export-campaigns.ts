/**
 * Amazon Ads API - Export Campaigns Bridge
 * Handles creating file-based exports of campaigns via the Amazon Ads API
 */

import { z } from 'zod';
import { withTracking } from '@/utils/api-tracker.js';
import { type ApiRegion, getApiBaseUrl } from './config.js';
import { refreshAccessToken } from './reauth.js';

// ============================================================================
// Schemas
// ============================================================================

const adProductFilterSchema = z.enum(['SPONSORED_BRANDS', 'SPONSORED_DISPLAY', 'SPONSORED_PRODUCTS']);

const stateFilterSchema = z.enum(['ARCHIVED', 'ENABLED', 'PAUSED']);

const baseExportRequestSchema = z.object({
    adProductFilter: z.array(adProductFilterSchema).min(1).max(3).optional(),
    stateFilter: z.array(stateFilterSchema).min(1).max(3).optional(),
});

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

export type ExportCampaignsRequest = z.infer<typeof baseExportRequestSchema>;
export type ExportCampaignsResponse = z.infer<typeof exportResponseSchema>;

export interface ExportCampaignsOptions {
    profileId: number; // Required for Amazon-Advertising-API-Scope header
    adProductFilter?: Array<'SPONSORED_BRANDS' | 'SPONSORED_DISPLAY' | 'SPONSORED_PRODUCTS'>;
    stateFilter?: Array<'ARCHIVED' | 'ENABLED' | 'PAUSED'>;
}

// ============================================================================
// API Bridge Function
// ============================================================================

/**
 * Creates a file-based export of campaigns via the Amazon Ads API
 * @param options - Request options including profileId and optional filters
 * @param region - API region (default: 'na' for North America)
 * @returns The export response with exportId and status
 */
export async function exportCampaigns(options: ExportCampaignsOptions, region: ApiRegion = 'na'): Promise<ExportCampaignsResponse> {
    return withTracking({ apiName: 'exportCampaigns', region }, async () => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}/campaigns/export`;

        // Build request body
        const requestBody: ExportCampaignsRequest = {};
        if (options.adProductFilter) {
            requestBody.adProductFilter = options.adProductFilter;
        }
        if (options.stateFilter) {
            requestBody.stateFilter = options.stateFilter;
        }

        // Validate request body
        const validatedRequestBody = baseExportRequestSchema.parse(requestBody);

        const headers: Record<string, string> = {
            'Amazon-Advertising-API-ClientId': clientId,
            'Amazon-Advertising-API-Scope': String(options.profileId),
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/vnd.campaignsexport.v1+json',
            Accept: 'application/vnd.campaignsexport.v1+json',
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(validatedRequestBody),
            signal: AbortSignal.timeout(30000),
        });

        // Store status code for tracking (even if error)
        const statusCode = response.status;

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to export campaigns: ${response.status} ${response.statusText}. ${errorText}`);
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


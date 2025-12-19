/**
 * Amazon Ads API - List Advertiser Accounts Bridge
 * Handles listing advertiser accounts from the Amazon Ads API
 */

import { z } from 'zod';
import { withTracking } from '@/utils/api-tracker.js';
import { type ApiRegion, getApiBaseUrl } from './config.js';
import { refreshAccessToken } from './reauth.js';
import { throttledFetch } from './throttled-fetch.js';

// ============================================================================
// Schemas
// ============================================================================

const statusSchema = z.enum(['CREATED', 'DISABLED', 'PARTIALLY_CREATED', 'PENDING']);

const alternateIdSchema = z.object({
    countryCode: z.string(),
    entityId: z.string().optional(),
    profileId: z.number().optional(),
});

const adsAccountWithMetadataSchema = z.object({
    accountName: z.string(),
    adsAccountId: z.string().regex(/^[A-Za-z0-9.-]+$/),
    alternateIds: z.array(alternateIdSchema).min(0).max(100),
    countryCodes: z.array(z.string()).min(0).max(100),
    status: statusSchema,
    errors: z
        .record(
            z.array(
                z.object({
                    errorCode: z.string().min(1),
                    errorId: z.number(),
                    errorMessage: z.string().min(1),
                })
            )
        )
        .optional(),
});

const listAdsAccountsResponseSchema = z.object({
    adsAccounts: z.array(adsAccountWithMetadataSchema).min(0).max(100),
    nextToken: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

export type AdsAccountWithMetadata = z.infer<typeof adsAccountWithMetadataSchema>;
export type AlternateId = z.infer<typeof alternateIdSchema>;
export type Status = z.infer<typeof statusSchema>;

export interface ListAdsAccountsOptions {
    maxResults?: number; // 1-100, default 100
    nextToken?: string;
}

// ============================================================================
// API Bridge Function
// ============================================================================

/**
 * Gets a list of advertiser accounts from the Amazon Ads API
 * @param options - Request options (maxResults, nextToken)
 * @param region - API region (default: 'na' for North America)
 * @returns Response with accounts and optional nextToken
 */
export async function listAdvertiserAccounts(options?: ListAdsAccountsOptions, region: ApiRegion = 'na'): Promise<{ adsAccounts: AdsAccountWithMetadata[]; nextToken?: string }> {
    return withTracking({ apiName: 'listAdvertiserAccounts', region }, async () => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}/adsAccounts/list`;

        const requestBody: Record<string, unknown> = {};
        if (options?.maxResults !== undefined) {
            requestBody.maxResults = options.maxResults;
        }
        if (options?.nextToken) {
            requestBody.nextToken = options.nextToken;
        }

        const headers: Record<string, string> = {
            'Amazon-Advertising-API-ClientId': clientId,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/vnd.listaccountsresource.v1+json',
        };

        const response = await throttledFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(30000),
        });

        // Store status code for tracking (even if error)
        const statusCode = response.status;

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to list advertiser accounts: ${response.status} ${response.statusText}. ${errorText}`);
            // Attach status code to error for tracking
            (error as Error & { statusCode?: number }).statusCode = statusCode;
            throw error;
        }

        const jsonData = await response.json();
        const result = listAdsAccountsResponseSchema.parse(jsonData);
        // Attach status code to result for tracking
        (result as typeof result & { statusCode?: number }).statusCode = statusCode;
        return result;
    });
}

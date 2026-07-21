/**
 * Amazon Ads API - Update Sponsored Products Ad Group Bids
 */

import { z } from 'zod';
import { withTracking } from '@/utils/api-tracker.js';
import { type ApiRegion, getApiBaseUrl } from './config.js';
import { refreshAccessToken } from './reauth.js';
import { AMAZON_ADS_API_RETRY, throttledFetch } from './throttled-fetch.js';

const updateAdGroupBidRequestSchema = z.array(
    z.object({
        adGroupId: z.string(),
        defaultBid: z.number(),
    })
);

const updateAdGroupBidResponseSchema = z.array(
    z.object({
        adGroupId: z.string().optional(),
        code: z.string().optional(),
        description: z.string().optional(),
    })
);

export interface UpdateAdGroupBidOptions {
    profileId: number;
    adGroupId: string;
    bid: number;
}

const isSuccessCode = (code?: string) => {
    if (!code) {
        return true;
    }
    const normalized = code.toUpperCase();
    return normalized === 'SUCCESS' || normalized === 'OK' || normalized === 'SUCCESSFUL';
};

const assertUpdateSuccess = (results: Array<{ adGroupId?: string; code?: string; description?: string }>, adGroupId: string) => {
    if (results.length === 0) {
        throw new Error('Amazon Ads update failed: empty response.');
    }

    const match = results.find(result => result.adGroupId === adGroupId) ?? results[0];
    if (!isSuccessCode(match.code)) {
        const message = match.description ? `Amazon Ads update failed: ${match.code} - ${match.description}` : `Amazon Ads update failed: ${match.code}`;
        throw new Error(message);
    }
};

export async function updateAdGroupBid(options: UpdateAdGroupBidOptions, region: ApiRegion = 'na') {
    return withTracking({ apiName: 'updateAdGroupBid', region }, async recordRequestMetrics => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}/sp/adGroups`;

        const requestBody = updateAdGroupBidRequestSchema.parse([
            {
                adGroupId: options.adGroupId,
                defaultBid: options.bid,
            },
        ]);

        const headers: Record<string, string> = {
            'Amazon-Advertising-API-ClientId': clientId,
            'Amazon-Advertising-API-Scope': String(options.profileId),
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        const response = await throttledFetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify(requestBody),
            timeoutMs: 30_000,
            retry: AMAZON_ADS_API_RETRY,
            onMetrics: recordRequestMetrics,
        });

        const statusCode = response.status;

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to update ad group bid: ${response.status} ${response.statusText}. ${errorText}`);
            (error as Error & { statusCode?: number }).statusCode = statusCode;
            throw error;
        }

        const jsonData = await response.json();
        const normalized = Array.isArray(jsonData) ? jsonData : [jsonData];
        const results = updateAdGroupBidResponseSchema.parse(normalized);

        assertUpdateSuccess(results, options.adGroupId);

        const payload = { results, statusCode };
        return payload;
    });
}

/**
 * Amazon Ads API - Update Sponsored Products Target Bids
 */

import { z } from 'zod';
import { withTracking } from '@/utils/api-tracker.js';
import { type ApiRegion, getApiBaseUrl } from './config.js';
import { refreshAccessToken } from './reauth.js';
import { throttledFetch } from './throttled-fetch.js';

const updateTargetBidRequestSchema = z.array(
    z.object({
        targetId: z.string(),
        bid: z.number(),
    })
);

const updateTargetBidResponseSchema = z.array(
    z.object({
        targetId: z.string().optional(),
        code: z.string().optional(),
        description: z.string().optional(),
    })
);

export interface UpdateTargetBidOptions {
    profileId: number;
    targetId: string;
    bid: number;
}

const isSuccessCode = (code?: string) => {
    if (!code) return true;
    const normalized = code.toUpperCase();
    return normalized === 'SUCCESS' || normalized === 'OK' || normalized === 'SUCCESSFUL';
};

const assertUpdateSuccess = (results: Array<{ targetId?: string; code?: string; description?: string }>, targetId: string) => {
    if (results.length === 0) {
        throw new Error('Amazon Ads update failed: empty response.');
    }

    const match = results.find(result => result.targetId === targetId) ?? results[0];
    if (!isSuccessCode(match.code)) {
        const message = match.description ? `Amazon Ads update failed: ${match.code} - ${match.description}` : `Amazon Ads update failed: ${match.code}`;
        throw new Error(message);
    }
};

export async function updateTargetBid(options: UpdateTargetBidOptions, region: ApiRegion = 'na') {
    return withTracking({ apiName: 'updateTargetBid', region }, async () => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}/sp/targets`;

        const requestBody = updateTargetBidRequestSchema.parse([
            {
                targetId: options.targetId,
                bid: options.bid,
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
            signal: AbortSignal.timeout(30000),
        });

        const statusCode = response.status;

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to update target bid: ${response.status} ${response.statusText}. ${errorText}`);
            (error as Error & { statusCode?: number }).statusCode = statusCode;
            throw error;
        }

        const jsonData = await response.json();
        const normalized = Array.isArray(jsonData) ? jsonData : [jsonData];
        const results = updateTargetBidResponseSchema.parse(normalized);

        assertUpdateSuccess(results, options.targetId);

        const payload = { results, statusCode };
        return payload;
    });
}

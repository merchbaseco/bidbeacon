import type { z } from 'zod';
import { withTracking } from '@/utils/api-tracker';
import { type ApiRegion, getApiBaseUrl } from './config';
import { refreshAccessToken } from './reauth';
import { AMAZON_ADS_API_RETRY, throttledFetch } from './throttled-fetch';

type SpRequestOptions<T> = {
    apiName: string;
    path: string;
    profileId: number;
    body: unknown;
    responseSchema?: z.ZodSchema<T>;
    accept?: string;
    contentType?: string;
    itemCount?: number;
};

export const spRequest = async <T>(options: SpRequestOptions<T>, region: ApiRegion = 'na') => {
    return withTracking({ apiName: options.apiName, region, itemCount: options.itemCount }, async recordRequestMetrics => {
        const accessToken = await refreshAccessToken();
        const clientId = process.env.ADS_API_CLIENT_ID;

        if (!clientId) {
            throw new Error('Missing ADS_API_CLIENT_ID environment variable');
        }

        const baseUrl = getApiBaseUrl(region);
        const url = `${baseUrl}${options.path}`;

        const headers: Record<string, string> = {
            'Amazon-Advertising-API-ClientId': clientId,
            'Amazon-Advertising-API-Scope': String(options.profileId),
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': options.contentType ?? 'application/json',
            Accept: options.accept ?? 'application/json',
        };

        const response = await throttledFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(options.body),
            timeoutMs: 30_000,
            retry: AMAZON_ADS_API_RETRY,
            onMetrics: recordRequestMetrics,
        });

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Amazon Ads request failed: ${response.status} ${response.statusText}. ${errorText}`);
            (error as Error & { statusCode?: number }).statusCode = response.status;
            throw error;
        }

        const jsonData = await response.json();
        if (options.responseSchema) {
            return options.responseSchema.parse(jsonData);
        }
        return jsonData as T;
    });
};

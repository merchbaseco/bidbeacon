/**
 * Amazon Ads API Authentication
 * Handles refreshing access tokens using refresh tokens via Login with Amazon (LWA) OAuth2 flow
 */

import { z } from 'zod';

const lwaTokenResponseSchema = z.object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number(),
    refresh_token: z.string().optional(),
});

/**
 * Refresh an Amazon Ads API access token using a refresh token
 * Reads ADS_API_CLIENT_ID, ADS_API_CLIENT_SECRET, and ADS_API_REFRESH_TOKEN from environment variables
 * @returns The access token
 * @throws Error if credentials are missing or token refresh fails
 */
export async function refreshAccessToken(): Promise<string> {
    const clientId = process.env.ADS_API_CLIENT_ID;
    const clientSecret = process.env.ADS_API_CLIENT_SECRET;
    const refreshToken = process.env.ADS_API_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
            'Missing ADS_API_CLIENT_ID, ADS_API_CLIENT_SECRET, or ADS_API_REFRESH_TOKEN environment variables'
        );
    }

    // Build x-www-form-urlencoded body
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

    try {
        const response = await fetch('https://api.amazon.com/auth/o2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: AbortSignal.timeout(15000), // 15 second timeout
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to fetch LWA token: ${response.status} ${response.statusText}. ${errorText}`
            );
        }

        const jsonData = await response.json();
        const data = lwaTokenResponseSchema.parse(jsonData);

        return data.access_token;
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === 'TimeoutError') {
                throw new Error('Failed to fetch LWA token: Request timeout');
            }
            throw error;
        }
        throw new Error(`Failed to fetch LWA token: ${String(error)}`);
    }
}

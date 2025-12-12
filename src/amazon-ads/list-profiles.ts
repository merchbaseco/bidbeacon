/**
 * Amazon Ads API - List Profiles Bridge
 * Handles listing profiles from the Amazon Ads API
 */

import { z } from 'zod';
import { type ApiRegion, getApiBaseUrl } from './config.js';
import { refreshAccessToken } from './reauth.js';

// ============================================================================
// Schemas
// ============================================================================

const accountTypeSchema = z.enum(['vendor', 'seller', 'agency']);

const accountInfoSchema = z.object({
    marketplaceStringId: z.string(),
    id: z.string(),
    type: accountTypeSchema,
    name: z.string(),
    subType: z.enum(['KDP_AUTHOR', 'AMAZON_ATTRIBUTION']).optional(),
    validPaymentMethod: z.boolean().optional(),
});

const profileSchema = z.object({
    profileId: z.number().int().positive(),
    countryCode: z.string(),
    currencyCode: z.string(),
    dailyBudget: z.number().optional(),
    timezone: z.string(),
    accountInfo: accountInfoSchema,
});

// ============================================================================
// Types
// ============================================================================

export type Profile = z.infer<typeof profileSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;

export interface ListProfilesOptions {
    apiProgram?:
        | 'billing'
        | 'campaign'
        | 'paymentMethod'
        | 'store'
        | 'report'
        | 'account'
        | 'posts';
    accessLevel?: 'edit' | 'view';
    profileTypeFilter?: ('seller' | 'vendor' | 'agency')[];
    validPaymentMethodFilter?: boolean;
}

// ============================================================================
// API Bridge Function
// ============================================================================

/**
 * Gets a list of profiles from the Amazon Ads API
 * @param options - Query parameters for filtering profiles
 * @param region - API region (default: 'na' for North America)
 * @returns Array of validated profiles
 */
export async function listProfiles(
    options?: ListProfilesOptions,
    region: ApiRegion = 'na'
): Promise<Profile[]> {
    const accessToken = await refreshAccessToken();
    const clientId = process.env.ADS_API_CLIENT_ID;

    if (!clientId) {
        throw new Error('Missing ADS_API_CLIENT_ID environment variable');
    }

    const baseUrl = getApiBaseUrl(region);
    const url = new URL(`${baseUrl}/v2/profiles`);

    // Add query parameters
    if (options) {
        if (options.apiProgram) {
            url.searchParams.set('apiProgram', options.apiProgram);
        }
        if (options.accessLevel) {
            url.searchParams.set('accessLevel', options.accessLevel);
        }
        if (options.profileTypeFilter && options.profileTypeFilter.length > 0) {
            url.searchParams.set('profileTypeFilter', options.profileTypeFilter.join(','));
        }
        if (options.validPaymentMethodFilter !== undefined) {
            url.searchParams.set(
                'validPaymentMethodFilter',
                String(options.validPaymentMethodFilter)
            );
        }
    }

    const headers: Record<string, string> = {
        'Amazon-Advertising-API-ClientId': clientId,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Failed to list profiles: ${response.status} ${response.statusText}. ${errorText}`
        );
    }

    const jsonData = await response.json();
    return z.array(profileSchema).parse(jsonData);
}

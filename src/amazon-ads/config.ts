/**
 * Amazon Ads API Configuration
 * Shared configuration utilities for Amazon Ads API bridges
 */

export type ApiRegion = 'na' | 'eu' | 'fe';

/**
 * Get the base URL for the Amazon Ads API based on region
 * @param region - API region (default: 'na' for North America)
 * @returns The base URL for the API
 */
export function getApiBaseUrl(region: ApiRegion = 'na'): string {
    const baseUrls: Record<ApiRegion, string> = {
        na: 'https://advertising-api.amazon.com',
        eu: 'https://advertising-api-eu.amazon.com',
        fe: 'https://advertising-api-fe.amazon.com',
    };
    return baseUrls[region];
}

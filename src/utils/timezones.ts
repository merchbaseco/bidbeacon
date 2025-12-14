/**
 * Timezone configuration mapping country codes to IANA timezone identifiers.
 */

export const COUNTRY_TIMEZONES: Record<string, string> = {
    // Pacific timezone
    US: 'America/Los_Angeles',
    MX: 'America/Los_Angeles',
    CA: 'America/Los_Angeles',

    // GMT timezone
    DE: 'Europe/London',
    ES: 'Europe/London',
    FR: 'Europe/London',
    IT: 'Europe/London',
    GB: 'Europe/London',

    // JST timezone
    JP: 'Asia/Tokyo',
};

/**
 * Get the timezone for a given country code.
 * Returns UTC as fallback if country code is not found.
 */
export function getTimezoneForCountry(countryCode: string): string {
    return COUNTRY_TIMEZONES[countryCode] ?? 'UTC';
}

const COUNTRY_TIMEZONES: Record<string, string> = {
    US: 'America/Los_Angeles',
    MX: 'America/Los_Angeles',
    CA: 'America/Los_Angeles',
    DE: 'Europe/London',
    ES: 'Europe/London',
    FR: 'Europe/London',
    IT: 'Europe/London',
    GB: 'Europe/London',
    JP: 'Asia/Tokyo',
};

export const getTimezoneForCountry = (countryCode: string) => COUNTRY_TIMEZONES[countryCode] ?? 'UTC';

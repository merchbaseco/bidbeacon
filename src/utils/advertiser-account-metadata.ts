import { getTimezoneForCountry } from './timezones';

const MARKETPLACE_IDS: Record<string, string> = {
    AE: 'A2VIGQ35RCS4UG',
    AU: 'A39IBJ37TRP1C6',
    BE: 'AMEN7PMS3EDWL',
    BR: 'A2Q3Y263D00KWC',
    CA: 'A2EUQ1WTGCTBG2',
    DE: 'A1PA6795UKMFR9',
    ES: 'A1RKKUPIHCS9HS',
    FR: 'A13V1IB3VIYZZH',
    GB: 'A1F83G8C2ARO7P',
    IE: 'A28R8C7NBKEWEA',
    IN: 'A21TJRUUN4KGV',
    IT: 'APJ6JRA9NG5V4',
    JP: 'A1VC38T7YXB528',
    MX: 'A1AM78C64UM0Y8',
    NL: 'A1805IZSGTT6HS',
    PL: 'A1C3SOZRARQ6R3',
    SA: 'A17E79C6D8DWNP',
    SE: 'A2NODRKZP88ZB9',
    SG: 'A19VAU5U5O7RUS',
    US: 'ATVPDKIKX0DER',
};

export const getAdvertiserAccountMetadata = (countryCode: string) => {
    const normalizedCountryCode = countryCode.toUpperCase();

    return {
        currency: getCurrencyForCountry(normalizedCountryCode),
        marketplaceId: MARKETPLACE_IDS[normalizedCountryCode] ?? normalizedCountryCode,
        timezone: getTimezoneForCountry(normalizedCountryCode),
    };
};

const getCurrencyForCountry = (countryCode: string) => {
    switch (countryCode) {
        case 'US':
            return 'USD';
        case 'CA':
            return 'CAD';
        case 'MX':
            return 'MXN';
        case 'BR':
            return 'BRL';
        case 'GB':
            return 'GBP';
        case 'IE':
        case 'DE':
        case 'FR':
        case 'ES':
        case 'IT':
        case 'NL':
        case 'BE':
            return 'EUR';
        case 'PL':
            return 'PLN';
        case 'SE':
            return 'SEK';
        case 'JP':
            return 'JPY';
        case 'AU':
            return 'AUD';
        case 'IN':
            return 'INR';
        case 'AE':
            return 'AED';
        case 'EG':
            return 'EGP';
        case 'SA':
            return 'SAR';
        case 'SG':
            return 'SGD';
        default:
            return 'USD';
    }
};

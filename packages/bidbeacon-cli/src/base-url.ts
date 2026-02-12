const TRAILING_SLASHES_REGEX = /\/+$/;
const API_SUFFIX_REGEX = /\/api$/i;

export const normalizeApiBaseUrl = (baseUrl: string) => {
    const trimmed = baseUrl.trim().replace(TRAILING_SLASHES_REGEX, '');
    if (API_SUFFIX_REGEX.test(trimmed)) {
        const withoutApiSuffix = trimmed.slice(0, -4);
        return withoutApiSuffix.length > 0 ? withoutApiSuffix : trimmed;
    }
    return trimmed;
};

export const withTransportHint = (errorMessage: string) => {
    if (errorMessage !== 'Unable to transform response from server' && errorMessage !== 'Failed to parse JSON') {
        return errorMessage;
    }

    return `${errorMessage}. Check \`bb config set base-url\`: use the server origin (for example https://api.bidbeacon.com), not a path ending in /api.`;
};

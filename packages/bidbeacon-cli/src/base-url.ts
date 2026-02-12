const TRAILING_SLASHES_REGEX = /\/+$/;
const API_SUFFIX_REGEX = /\/api$/i;
const API_PATH_SEGMENT = '/api/';
const PATH_SEPARATOR = ',';

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

    return `${errorMessage}. Check \`bb config set base-url\`: use the server origin (for example https://bidbeacon.merchbase.co), not a path ending in /api.`;
};

export const encodeTrpcProcedurePath = (urlString: string) => {
    const url = new URL(urlString);
    const apiPathIndex = url.pathname.indexOf(API_PATH_SEGMENT);
    if (apiPathIndex < 0) {
        return urlString;
    }

    const procedurePathStart = apiPathIndex + API_PATH_SEGMENT.length;
    const procedurePath = url.pathname.slice(procedurePathStart);
    if (!procedurePath) {
        return urlString;
    }

    const encodedProcedurePath = procedurePath
        .split(PATH_SEPARATOR)
        .map(segment => encodeURIComponent(decodeURIComponent(segment)))
        .join(PATH_SEPARATOR);

    if (encodedProcedurePath === procedurePath) {
        return urlString;
    }

    url.pathname = `${url.pathname.slice(0, procedurePathStart)}${encodedProcedurePath}`;
    return url.toString();
};

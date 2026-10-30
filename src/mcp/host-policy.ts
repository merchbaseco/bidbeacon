const bidBeaconWebsiteOrigin = 'https://bidbeacon.merchbase.co';
const localHostPattern = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export const bidBeaconMcpOriginForHost = (host: string | undefined, environment = process.env.NODE_ENV) => {
    if (host === 'bidbeacon.merchbase.co' || host === 'bidbeacon-api.merchbase.co') {
        return `https://${host}`;
    }
    if (environment === 'development' && host && localHostPattern.test(host)) {
        return `http://${host}`;
    }
    return null;
};

export const isBidBeaconMcpPath = (url: string | undefined) => {
    if (!url) {
        return false;
    }
    try {
        const parsed = new URL(url, 'https://bidbeacon-mcp.invalid');
        return parsed.origin === 'https://bidbeacon-mcp.invalid' && parsed.pathname === '/mcp';
    } catch {
        return false;
    }
};

export const isAllowedMcpOrigin = (origin: string | undefined, environment = process.env.NODE_ENV) => {
    if (!origin) {
        return true;
    }
    if (origin === bidBeaconWebsiteOrigin) {
        return true;
    }
    try {
        const url = new URL(origin);
        return environment === 'development' && url.origin === origin && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    } catch {
        return false;
    }
};

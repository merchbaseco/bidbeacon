import { assertDevCloudflareAccessTarget } from '@merchbaseco/access/dev';

// Every value below is declared once, in .env.schema, and delivered by varlock.
// Nothing is defaulted here: a second default would be a second owner.
const getDatabaseConfig = () => {
    const port = Number(process.env.BIDBEACON_DATABASE_PORT);
    const password = process.env.BIDBEACON_DATABASE_PASSWORD;
    const host = process.env.BIDBEACON_DATABASE_HOST;
    const name = process.env.BIDBEACON_DATABASE_NAME;
    const user = process.env.BIDBEACON_DATABASE_USER;

    if (!password) {
        throw new Error('BIDBEACON_DATABASE_PASSWORD is required');
    }

    if (!(host && name && user)) {
        throw new Error('BIDBEACON_DATABASE_HOST, BIDBEACON_DATABASE_NAME, and BIDBEACON_DATABASE_USER are required');
    }

    if (Number.isNaN(port) || port < 1 || port > 65_535) {
        throw new Error('BIDBEACON_DATABASE_PORT must be a valid port number');
    }

    if (process.env.NODE_ENV === 'development') {
        assertDevCloudflareAccessTarget({ databaseUrl: getDatabaseUrl(process.env), env: process.env });
    }
    return { host, port, name, user, password };
};

export { getDatabaseConfig };

export const getDatabaseUrl = (env: Record<string, string | undefined>) => {
    const url = new URL('postgresql://localhost');
    const host = env.BIDBEACON_DATABASE_HOST ?? '';
    const normalizedHost = host === '::1' ? '[::1]' : host;
    url.hostname = normalizedHost;
    if (!normalizedHost || url.hostname !== normalizedHost) {
        throw new Error('Invalid database host.');
    }
    url.port = env.BIDBEACON_DATABASE_PORT ?? '';
    url.pathname = `/${env.BIDBEACON_DATABASE_NAME ?? ''}`;
    return url.href;
};

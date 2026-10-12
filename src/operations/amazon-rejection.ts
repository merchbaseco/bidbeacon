import { inspect } from 'node:util';
import { logger } from '@/utils/logger';

export const logAmazonRejection = (raw: unknown) => {
    logger.error(`Amazon Ads rejected an entity operation ${formatRejection(redactForLog(raw))}`);
};

const formatRejection = (value: unknown) => {
    try {
        return JSON.stringify(value);
    } catch {
        return inspect(value, { breakLength: Number.POSITIVE_INFINITY, depth: null, maxArrayLength: null });
    }
};

const SENSITIVE_LOG_KEYS = new Set(['access_token', 'amazon-advertising-api-clientid', 'authorization', 'client_secret', 'clientid', 'cookie', 'headers', 'password', 'refresh_token', 'token']);

const redactForLog = (value: unknown, seen?: WeakSet<object>): unknown => {
    if (typeof value === 'string') {
        return value.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]');
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }

    const visited = seen ?? new WeakSet<object>();
    if (visited.has(value)) {
        return undefined;
    }
    visited.add(value);

    if (Array.isArray(value)) {
        return value.map(item => redactForLog(item, visited));
    }

    const source: Record<string, unknown> = {};
    if (value instanceof Error) {
        source.message = value.message;
    }
    for (const [key, nested] of Object.entries(value)) {
        source[key] = nested;
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(source)) {
        if (SENSITIVE_LOG_KEYS.has(key.toLowerCase())) {
            continue;
        }
        redacted[key] = redactForLog(nested, visited);
    }
    return redacted;
};

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { OperationError } from './operation-errors';

const CURSOR_VERSION = 1;
const processCursorSecret = randomBytes(32).toString('hex');

export type SearchCursorBoundary = readonly unknown[];

export type SearchCursorPayload = {
    version: typeof CURSOR_VERSION;
    fingerprint: string;
    boundary: SearchCursorBoundary;
};

export const createSearchQueryFingerprint = (query: unknown) => createHash('sha256').update(serializeSearchValue(query)).digest('hex');

export const serializeSearchValue = (value: unknown): string => {
    if (Array.isArray(value)) {
        return `[${value.map(serializeSearchValue).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${serializeSearchValue(entryValue)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
};

export const encodeSearchCursor = (fingerprint: string, boundary: SearchCursorBoundary) => {
    const payload: SearchCursorPayload = { version: CURSOR_VERSION, fingerprint, boundary };
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', getCursorSecret()).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
};

export const decodeSearchCursor = (cursor: string, expectedFingerprint: string): SearchCursorPayload => {
    try {
        const parts = cursor.split('.');
        if (parts.length !== 2) {
            throw new Error('invalid cursor parts');
        }
        const [encodedPayload, encodedSignature] = parts;
        if (!(encodedPayload && encodedSignature)) {
            throw new Error('invalid cursor parts');
        }

        const expectedSignature = createHmac('sha256', getCursorSecret()).update(encodedPayload).digest('base64url');
        const providedSignature = Buffer.from(encodedSignature, 'base64url');
        const actualSignature = Buffer.from(expectedSignature, 'base64url');
        if (providedSignature.length !== actualSignature.length || !timingSafeEqual(providedSignature, actualSignature)) {
            throw new Error('invalid cursor signature');
        }

        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<SearchCursorPayload>;
        if (payload.version !== CURSOR_VERSION || payload.fingerprint !== expectedFingerprint || !Array.isArray(payload.boundary)) {
            throw new Error('invalid cursor payload');
        }

        return payload as SearchCursorPayload;
    } catch {
        throw new OperationError('CURSOR_INVALID', 'The Search cursor is malformed or bound to a different query.');
    }
};

const getCursorSecret = () => process.env.BIDBEACON_SEARCH_CURSOR_SECRET ?? processCursorSecret;

const encodeBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

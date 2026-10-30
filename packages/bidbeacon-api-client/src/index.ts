import { createTRPCProxyClient, httpBatchLink, httpLink } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { CliAppRouter } from './app-router';

const TRAILING_SLASHES_REGEX = /\/+$/;
const API_PATH_SEGMENT = '/api/';
const PATH_SEPARATOR = ',';
const DEFAULT_BATCH_MAX_ITEMS = 20;
const DEFAULT_BATCH_MAX_URL_LENGTH = 2000;

export type AppRouter = CliAppRouter;

export type RouterInputs = inferRouterInputs<CliAppRouter>;
export type RouterOutputs = inferRouterOutputs<CliAppRouter>;
export type CliRouterInputs = RouterInputs;
export type CliRouterOutputs = RouterOutputs;
export type PublicRouterInputs = RouterInputs;
export type PublicRouterOutputs = RouterOutputs;

export type BidBeaconClientOptions = {
    baseUrl: string;
    credential?: string;
    accessToken?: string;
    headers?: Record<string, string>;
    batch?: boolean;
    batchMaxItems?: number;
    batchMaxURLLength?: number;
};

type CliProxyClient = ReturnType<typeof createTRPCProxyClient<CliAppRouter>>;

export type BidBeaconClient = CliProxyClient;

export const createBidBeaconClient = ({
    baseUrl,
    credential,
    accessToken,
    headers,
    batch = true,
    batchMaxItems = DEFAULT_BATCH_MAX_ITEMS,
    batchMaxURLLength = DEFAULT_BATCH_MAX_URL_LENGTH,
}: BidBeaconClientOptions): BidBeaconClient => {
    if (credential && accessToken) {
        throw new Error('Choose a machine credential or OAuth access token.');
    }
    const credentialHeaders = credential ? machineCredentialHeaders(credential) : accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const url = `${normalizeBaseUrl(baseUrl)}/api`;
    const resolveHeaders = () => ({
        ...credentialHeaders,
        ...(headers ?? {}),
    });
    const transportFetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(encodeTrpcProcedurePath(getRequestUrl(input)), { ...init, redirect: 'manual', credentials: 'omit' });

    if (batch) {
        const client = createTRPCProxyClient<CliAppRouter>({
            links: [
                httpBatchLink({
                    url,
                    headers: resolveHeaders,
                    fetch: transportFetch,
                    maxItems: batchMaxItems,
                    maxURLLength: batchMaxURLLength,
                }),
            ],
        });
        return client;
    }

    const client = createTRPCProxyClient<CliAppRouter>({
        links: [
            httpLink({
                url,
                headers: resolveHeaders,
                fetch: transportFetch,
            }),
        ],
    });
    return client;
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(TRAILING_SLASHES_REGEX, '');

const getRequestUrl = (request: RequestInfo | URL) => {
    if (typeof request === 'string') {
        return request;
    }
    if (request instanceof URL) {
        return request.toString();
    }
    return request.url;
};

const encodeTrpcProcedurePath = (urlString: string) => {
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

const encodedPattern = /^[A-Za-z0-9_-]+$/;
const clientIdPattern = /^[A-Za-z0-9._-]{1,256}$/;
const clientSecretPattern = /^[A-Za-z0-9_-]{32,512}$/;

/** Native Merchbase key wire format; this public package has no private SDK dependency. */
const machineCredentialHeaders = (credential: string): Record<string, string> => {
    const invalid = () => new Error('A valid mbk_v1 Merchbase API key is required.');
    if (credential.length > 2048 || !credential.startsWith('mbk_v1.')) {
        throw invalid();
    }
    const encoded = credential.slice(7);
    if (!encodedPattern.test(encoded)) {
        throw invalid();
    }
    let decoded: unknown;
    try {
        const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
        const canonical = btoa(String.fromCharCode(...bytes))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        if (canonical !== encoded) {
            throw invalid();
        }
        decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
        throw invalid();
    }
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
        throw invalid();
    }
    if (Object.keys(decoded).sort().join(',') !== 'clientId,clientSecret') {
        throw invalid();
    }
    if (!('clientId' in decoded && typeof decoded.clientId === 'string' && clientIdPattern.test(decoded.clientId))) {
        throw invalid();
    }
    if (!('clientSecret' in decoded && typeof decoded.clientSecret === 'string' && clientSecretPattern.test(decoded.clientSecret))) {
        throw invalid();
    }
    return { 'CF-Access-Client-Id': decoded.clientId, 'CF-Access-Client-Secret': decoded.clientSecret };
};

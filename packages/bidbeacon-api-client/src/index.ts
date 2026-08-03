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
    headers,
    batch = true,
    batchMaxItems = DEFAULT_BATCH_MAX_ITEMS,
    batchMaxURLLength = DEFAULT_BATCH_MAX_URL_LENGTH,
}: BidBeaconClientOptions): BidBeaconClient => {
    const url = `${normalizeBaseUrl(baseUrl)}/api`;
    const resolveHeaders = () => ({
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        ...(headers ?? {}),
    });
    const transportFetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(encodeTrpcProcedurePath(getRequestUrl(input)), init);

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

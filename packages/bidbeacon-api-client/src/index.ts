import { createTRPCProxyClient, httpBatchLink, httpLink } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { CliAppRouter } from './app-router';

const TRAILING_SLASHES_REGEX = /\/+$/;

export type AppRouter = CliAppRouter;

export type RouterInputs = inferRouterInputs<CliAppRouter>;
export type RouterOutputs = inferRouterOutputs<CliAppRouter>;
export type CliRouterInputs = RouterInputs;
export type CliRouterOutputs = RouterOutputs;
export type PublicRouterInputs = RouterInputs;
export type PublicRouterOutputs = RouterOutputs;

export type BidBeaconClientOptions = {
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
    batch?: boolean;
};

type CliProxyClient = ReturnType<typeof createTRPCProxyClient<CliAppRouter>>;

export type BidBeaconClient = CliProxyClient;

export const createBidBeaconClient = ({ baseUrl, apiKey, headers, batch = true }: BidBeaconClientOptions): BidBeaconClient => {
    const url = `${normalizeBaseUrl(baseUrl)}/api`;
    const resolveHeaders = () => ({
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(headers ?? {}),
    });

    if (batch) {
        const client = createTRPCProxyClient<CliAppRouter>({
            links: [
                httpBatchLink({
                    url,
                    headers: resolveHeaders,
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
            }),
        ],
    });
    return client;
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(TRAILING_SLASHES_REGEX, '');

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink, loggerLink } from '@trpc/client';
import { useState } from 'react';
import { apiBaseUrl } from '../router';
import { api } from './trpc';

export const TRPCProvider = ({ children }: { children: React.ReactNode }) => {
    const [queryClient] = useState(() => new QueryClient());

    const [trpcClient] = useState(() =>
        api.createClient({
            links: [
                loggerLink({
                    enabled: () => true,
                }),
                httpLink({
                    url: `${apiBaseUrl}/api`,
                    fetch: (url, init) => fetch(url, { ...init, credentials: 'same-origin', redirect: 'manual' }),
                }),
            ],
        })
    );

    return (
        <api.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </api.Provider>
    );
};

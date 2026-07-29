import { useAuth } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink, loggerLink } from '@trpc/client';
import { useState } from 'react';
import { apiBaseUrl } from '../router';
import { api } from './trpc';

export const TRPCProvider = ({ children }: { children: React.ReactNode }) => {
    const { getToken } = useAuth();

    const [queryClient] = useState(() => new QueryClient());

    const [trpcClient] = useState(() =>
        api.createClient({
            links: [
                loggerLink({
                    enabled: () => true,
                }),
                httpLink({
                    url: `${apiBaseUrl}/api`,
                    async headers() {
                        const token = await getToken();
                        return token ? { Authorization: `Bearer ${token}` } : {};
                    },
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

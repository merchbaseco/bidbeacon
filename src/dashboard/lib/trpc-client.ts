import { httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';
import { apiBaseUrl } from '../router.js';

export function createTRPCClient() {
    return {
        transformer: superjson,
        links: [
            loggerLink({
                enabled: () => true,
            }),
            httpBatchLink({
                url: `${apiBaseUrl}/api`,
            }),
        ],
    };
}

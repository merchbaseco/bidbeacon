import { httpBatchLink, loggerLink } from '@trpc/client';
import { apiBaseUrl } from '../router.js';

export function createTRPCClient() {
    return {
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

import { httpLink, loggerLink } from '@trpc/client';
import { apiBaseUrl } from '../router.js';

export function createTRPCClient() {
    return {
        links: [
            loggerLink({
                enabled: () => true,
            }),
            httpLink({
                url: `${apiBaseUrl}/api`,
            }),
        ],
    };
}

import { httpBatchLink } from '@trpc/client';
import { apiBaseUrl } from '../router.js';

export function createTRPCClient() {
    return {
        links: [
            httpBatchLink({
                url: `${apiBaseUrl}/api`,
            }),
        ],
    };
}

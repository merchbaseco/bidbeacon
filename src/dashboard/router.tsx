import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export type RouterContext = {
    apiBaseUrl: string;
};

function resolveApiBaseUrl() {
    const envApi =
        typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
            ? import.meta.env.VITE_API_BASE_URL
            : undefined;

    const serverApi =
        typeof process !== 'undefined' && process.env.BIDBEACON_API_URL
            ? process.env.BIDBEACON_API_URL
            : undefined;

    const baseUrl = (envApi ?? serverApi ?? 'http://localhost:8080').replace(/\/$/, '');
    return baseUrl;
}

export function createAppRouter() {
    const apiBaseUrl = resolveApiBaseUrl();

    return createRouter({
        routeTree,
        context: { apiBaseUrl },
        defaultPreload: 'intent',
    });
}

let routerInstance: ReturnType<typeof createAppRouter> | null = null;

export async function getRouter() {
    if (!routerInstance) {
        routerInstance = createAppRouter();
    }

    return routerInstance;
}

declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof createAppRouter>;
    }
}

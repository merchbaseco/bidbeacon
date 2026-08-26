import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router';
import { RootRoute } from './layout';
import { IndexRoute } from './routes/index';

const TRAILING_SLASH_REGEX = /\/$/;

const PRODUCTION_API_BASE_URL = 'https://bidbeacon.merchbase.co';

/**
 * A dev server talks to its own origin, so `/api` lands on the Vite proxy and
 * from there on `BIDBEACON_DASHBOARD_API_PROXY_TARGET` — the local API server,
 * and the local database the dev seed just filled. Reaching past it to the
 * production origin would show a cloud session an empty dashboard it holds no
 * session for. It stays an absolute origin rather than an empty string because
 * the realtime hooks derive a `ws(s)://` URL from it.
 *
 * A built bundle keeps the deployed origin, where Caddy serves the dashboard
 * and `/api` from one host anyway.
 */
function resolveDefaultApiBaseUrl() {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
        return window.location.origin;
    }

    return PRODUCTION_API_BASE_URL;
}

function resolveApiBaseUrl() {
    const envApi = typeof import.meta !== 'undefined' && import.meta.env?.VITE_BIDBEACON_API_URL ? import.meta.env.VITE_BIDBEACON_API_URL : undefined;

    const baseUrl = (envApi ?? resolveDefaultApiBaseUrl()).replace(TRAILING_SLASH_REGEX, '');
    return baseUrl;
}

export const apiBaseUrl = resolveApiBaseUrl();

export const router = createBrowserRouter(
    createRoutesFromElements(
        <Route element={<RootRoute />} path="/">
            <Route element={<IndexRoute />} index />
        </Route>
    )
);

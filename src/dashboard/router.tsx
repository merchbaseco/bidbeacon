import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router';
import { RootRoute } from './layout';
import { IndexRoute } from './routes/index';

const TRAILING_SLASH_REGEX = /\/$/;

function resolveApiBaseUrl() {
    const envApi = typeof import.meta !== 'undefined' && import.meta.env?.VITE_BIDBEACON_API_URL ? import.meta.env.VITE_BIDBEACON_API_URL : undefined;

    const baseUrl = (envApi ?? 'https://bidbeacon.merchbase.co').replace(TRAILING_SLASH_REGEX, '');
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

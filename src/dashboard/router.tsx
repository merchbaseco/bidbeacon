import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router';
import { RootRoute } from './layout';
import { IndexRoute } from './routes/index';

function resolveApiBaseUrl() {
    const envApi =
        typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
            ? import.meta.env.VITE_API_BASE_URL
            : undefined;

    const baseUrl = (envApi ?? 'https://bidbeacon.merchbase.co').replace(/\/$/, '');
    return baseUrl;
}

export const apiBaseUrl = resolveApiBaseUrl();

export const router = createBrowserRouter(
    createRoutesFromElements(
        <Route path="/" element={<RootRoute />}>
            <Route index element={<IndexRoute />} />
        </Route>
    )
);

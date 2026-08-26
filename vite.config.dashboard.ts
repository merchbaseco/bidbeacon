import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Env comes from the process (delivered by `varlock run`), never from a .env
// file: .env.schema is the only place these values are declared.
export default defineConfig(() => {
    const apiProxyTarget = process.env.BIDBEACON_DASHBOARD_API_PROXY_TARGET;

    // `BIDBEACON_DEV_HOST` is the repository's contract for this bind address
    // and defaults to loopback, which keeps a dev server — and the synthetic
    // seed data behind it — off the network. An environment that reaches the
    // server through a port forwarder sets 0.0.0.0 for its own dev command;
    // see the schema entry. Only the socket widens: the app still believes it
    // serves its own origin.
    const devServerHost = process.env.BIDBEACON_DEV_HOST || '127.0.0.1';

    return {
        plugins: [react(), tailwindcss(), tsconfigPaths()],
        root: 'src/dashboard',
        build: {
            outDir: '../../dist/dashboard',
            emptyOutDir: true,
        },
        server: {
            host: devServerHost,
            port: 4173,
            strictPort: false,
            proxy: {
                '/api': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                    secure: true,
                    // The dashboard's realtime stream is a WebSocket on
                    // `/api/events`, and it derives its origin from the page's.
                    // Vite only attaches an `upgrade` listener when a proxy
                    // entry asks for one, so without this the event stream
                    // silently never connects in development.
                    ws: true,
                },
            },
        },
    };
});

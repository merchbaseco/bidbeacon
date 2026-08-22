import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Env comes from the process (delivered by `varlock run`), never from a .env
// file: .env.schema is the only place these values are declared.
export default defineConfig(() => {
    const apiProxyTarget = process.env.BIDBEACON_DASHBOARD_API_PROXY_TARGET;

    return {
        plugins: [react(), tailwindcss(), tsconfigPaths()],
        root: 'src/dashboard',
        build: {
            outDir: '../../dist/dashboard',
            emptyOutDir: true,
        },
        server: {
            port: 4173,
            strictPort: false,
            proxy: {
                '/api': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                    secure: true,
                },
            },
        },
    };
});

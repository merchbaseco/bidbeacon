import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, rootDir, '');
    const apiProxyTarget = env.DASHBOARD_API_PROXY_TARGET ?? 'https://bidbeacon.merchbase.co';

    return {
        envDir: rootDir,
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
                target: 'https://bidbeacon.merchbase.co',
                changeOrigin: true,
                secure: true,
            },
        },
    },
});

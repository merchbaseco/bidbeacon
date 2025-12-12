import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    root: 'src/dashboard',
    build: {
        outDir: '../../dist/dashboard',
        emptyOutDir: true,
    },
    server: {
        port: 4173,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'https://bidbeacon.merchbase.co',
                changeOrigin: true,
                secure: true,
            },
        },
    },
});

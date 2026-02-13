import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from './server-config';

describe('server config', () => {
    let server: ReturnType<typeof createServer> | undefined;

    afterEach(async () => {
        if (server) {
            await server.close();
            server = undefined;
        }
    });

    it('accepts long tRPC-style batched route params', async () => {
        server = createServer();
        server.get('/api/:trpc', async () => ({ ok: true }));

        const procedurePath = Array.from({ length: 8 }, () => 'accounts%2Flist').join(',');
        expect(procedurePath.length).toBeGreaterThan(100);

        const response = await server.inject({
            method: 'GET',
            url: `/api/${procedurePath}?batch=1&input=%7B%7D`,
        });

        expect(response.statusCode).toBe(200);
    });
});

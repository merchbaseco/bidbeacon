import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createBidBeaconClient } from '../../packages/bidbeacon-api-client/src';

const credential = 'mbk_v1.eyJjbGllbnRJZCI6ImZpeHR1cmUuYWNjZXNzIiwiY2xpZW50U2VjcmV0IjoiQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUEifQ';

describe('native Merchbase credential transport', () => {
    it('decodes the literal suite fixture and rejects retired or noncanonical keys', () => {
        expect(() => createBidBeaconClient({ baseUrl: 'https://bidbeacon-api.merchbase.co', credential })).not.toThrow();
        for (const value of ['ak_retired', `${credential}=`, 'mbk_v1.eyJjbGllbnRJZCI6MX0', `mbk_v1.${'A'.repeat(2048)}`]) {
            expect(() => createBidBeaconClient({ baseUrl: 'https://bidbeacon-api.merchbase.co', credential: value })).toThrow('valid mbk_v1');
        }
    });

    it.each([true, false])('never forwards native secrets across redirects (batch=%s)', async batch => {
        let destinationRequests = 0;
        const destination = createServer((_request, response) => {
            destinationRequests += 1;
            response.end('{}');
        });
        await new Promise<void>(resolve => destination.listen(0, '127.0.0.1', resolve));
        const target = destination.address();
        if (!target || typeof target === 'string') {
            throw new Error('Missing destination port');
        }
        const server = createServer((request, response) => {
            expect(request.headers['cf-access-client-id']).toBe('fixture.access');
            expect(request.headers['cf-access-client-secret']).toBe('A'.repeat(32));
            expect(request.headers.authorization).toBeUndefined();
            expect(request.headers.cookie).toBeUndefined();
            response.writeHead(302, { location: `http://127.0.0.1:${target.port}/capture` });
            response.end();
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const address = server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Missing origin port');
            }
            const client = createBidBeaconClient({ baseUrl: `http://127.0.0.1:${address.port}`, credential, batch });
            await expect(client.list_advertiser_accounts.query({})).rejects.toThrow();
            expect(destinationRequests).toBe(0);
        } finally {
            await Promise.all([
                new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))),
                new Promise<void>((resolve, reject) => destination.close(error => (error ? reject(error) : resolve()))),
            ]);
        }
    });
});

import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createFakeAmazonAdsGateway } from '@/operations/amazon-ads-gateway';
import { createOperationContext } from '@/operations/operation-context';
import { createBidBeaconMcpServer } from './server';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('BidBeacon MCP server info', () => {
    it('advertises the website and a same-origin PNG icon', async () => {
        const server = createBidBeaconMcpServer(
            createOperationContext({
                amazonAds: createFakeAmazonAdsGateway(),
                db: {} as never,
                principal: { accessibleAccountIds: [], credentialKind: 'oauth', merchbaseUserId: 'mbu_server_info_test' },
            })
        );
        const client = new Client({ name: 'test-client', version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            expect(client.getServerVersion()).toMatchObject({
                name: 'bidbeacon',
                title: 'BidBeacon',
                websiteUrl: 'https://bidbeacon.merchbase.co',
                icons: [{ src: 'https://bidbeacon.merchbase.co/icon.png', mimeType: 'image/png', sizes: ['128x128'] }],
            });
        } finally {
            await Promise.all([client.close(), server.close()]);
        }
    });

    it('ships the advertised icon as a 128x128 PNG under 64 KiB', () => {
        const icon = readFileSync(new URL('../dashboard/public/icon.png', import.meta.url));

        expect(icon.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
        expect(icon.readUInt32BE(16)).toBe(128);
        expect(icon.readUInt32BE(20)).toBe(128);
        expect(icon.byteLength).toBeLessThanOrEqual(64 * 1024);
    });
});

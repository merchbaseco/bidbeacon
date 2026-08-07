import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { advertiserAccount, campaign } from '@/db/schema';
import { createFakeAmazonAdsGateway } from '@/operations/amazon-ads-gateway';
import { createOperationContext, type OperationContext } from '@/operations/operation-context';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { buildAdvertiserAccount, buildCampaign } from '@/operations/testing/fixtures';
import { MCP_SERVER_INSTRUCTIONS, MCP_TOOL_NAMES } from './operation-definitions';
import { createBidBeaconMcpServer } from './server';

const accountId = '00000000-0000-4000-8000-000000000001';
const inaccessibleAccountId = '00000000-0000-4000-8000-000000000002';

describe('BidBeacon MCP server', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('exposes exactly the reviewed operation inventory with generated schemas, annotations, and tool-only capabilities', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdvertiserAccount({ id: accountId, adsAccountId: 'ads-account-mcp', profileId: '1001' }));

        const { client, close } = await connectClient(createContext(database));
        try {
            const listed = await client.listTools();
            expect(listed.tools.map(tool => tool.name)).toEqual(MCP_TOOL_NAMES);
            expect(listed.tools).toHaveLength(14);

            const listTool = listed.tools.find(tool => tool.name === 'list_advertiser_accounts');
            const searchTool = listed.tools.find(tool => tool.name === 'search');
            const createCampaignTool = listed.tools.find(tool => tool.name === 'create_campaign');
            const updateTool = listed.tools.find(tool => tool.name === 'update_campaign');
            expect(listTool?.inputSchema.properties).toEqual({});
            expect(searchTool?.inputSchema.required).toContain('accountId');
            expect(createCampaignTool?.inputSchema.required).toEqual(['accountId', 'name', 'state', 'dailyBudget', 'bidStrategy', 'targetingMode', 'startDate']);
            expect(updateTool?.inputSchema.required).toEqual(['accountId', 'campaignId', 'changes']);
            expect(updateTool?.outputSchema?.required).toEqual(['id', 'name', 'state', 'deliveryStatus', 'dailyBudget', 'bidStrategy', 'targetingMode', 'startDate', 'endDate']);

            expect(listTool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
            for (const tool of listed.tools.filter(tool => tool.name.startsWith('create_'))) {
                expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
            }
            for (const tool of listed.tools.filter(tool => tool.name.startsWith('update_'))) {
                expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true });
            }
            expect(updateTool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true });
            expect(searchTool?.description).toContain('Account UUID');
            expect(updateTool?.description).toContain('Account UUID');
            for (const tool of listed.tools) {
                expect(tool.description?.toLowerCase()).toContain('returns');
                expect(tool.description).toContain('stable BidBeacon tool error');
            }
            expect(listed.tools.find(tool => tool.name === 'create_sponsored_products_campaign')?.description).toContain('preferred');

            const capabilities = client.getServerCapabilities();
            expect(capabilities).toEqual(expect.objectContaining({ tools: expect.any(Object) }));
            expect(capabilities).not.toHaveProperty('resources');
            expect(capabilities).not.toHaveProperty('prompts');
            expect(capabilities).not.toHaveProperty('sampling');
            expect(client.getInstructions()).toBe(MCP_SERVER_INSTRUCTIONS);
        } finally {
            await close();
        }
    });

    it('returns identical portable JSON text and structured content for reads and writes', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdvertiserAccount({ id: accountId, adsAccountId: 'ads-account-mcp', profileId: '1001' }));
        await database.db.insert(campaign).values(buildCampaign({ id: 'campaign-row-mcp', campaignId: 'campaign-mcp', accountId: 'ads-account-mcp', countryCode: 'US' }));

        const amazonAds = createFakeAmazonAdsGateway({ responses: { updateCampaigns: { success: [{ campaign: { campaignId: 'campaign-mcp', state: 'PAUSED' } }] } } });
        const { client, close } = await connectClient(createContext(database, amazonAds));
        try {
            const readResult = await client.callTool({ name: 'list_advertiser_accounts', arguments: {} });
            expect(readResult.isError).not.toBe(true);
            expect(parseText(readResult)).toEqual(readResult.structuredContent);

            const writeResult = await client.callTool({
                name: 'update_campaign',
                arguments: { accountId, campaignId: 'campaign-mcp', changes: { state: 'PAUSED' } },
            });
            expect(writeResult.isError).not.toBe(true);
            expect(parseText(writeResult)).toEqual(writeResult.structuredContent);
            expect(writeResult.structuredContent).toMatchObject({ id: 'campaign-mcp', state: 'PAUSED' });
            expect(amazonAds.calls.map(call => call.operation)).toEqual(['updateCampaigns']);
        } finally {
            await close();
        }
    });

    it('returns stable tool errors without structured content for inaccessible accounts', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdvertiserAccount({ id: accountId, adsAccountId: 'ads-account-mcp', profileId: '1001' }));

        const { client, close } = await connectClient(createContext(database));
        try {
            const result = await client.callTool({
                name: 'search',
                arguments: { accountId: inaccessibleAccountId, resource: 'campaign' },
            });

            expect(result.isError).toBe(true);
            expect(result.structuredContent).toBeUndefined();
            expect(parseText(result)).toEqual({
                error: {
                    code: 'ACCOUNT_ACCESS_DENIED',
                    details: {},
                    message: 'The caller cannot access this Advertiser Account.',
                },
            });
        } finally {
            await close();
        }
    });

    it('returns the stable INVALID_INPUT envelope when arguments fail a generated tool schema', async () => {
        database = await createTestDatabase();
        const { client, close } = await connectClient(createContext(database));

        try {
            const result = await client.callTool({
                name: 'search',
                arguments: { resource: 'campaign' },
            });

            expect(result.isError).toBe(true);
            expect(result.structuredContent).toBeUndefined();
            expect(parseText(result)).toMatchObject({
                error: {
                    code: 'INVALID_INPUT',
                    details: { issues: expect.any(Array) },
                    message: expect.any(String),
                },
            });
        } finally {
            await close();
        }
    });
});

const createContext = (database: TestDatabase, amazonAds = createFakeAmazonAdsGateway()): OperationContext =>
    createOperationContext({
        amazonAds,
        db: database.db as never,
        principal: {
            accessibleAccountIds: [accountId],
            credentialKind: 'oauth',
            merchbaseUserId: 'mbu_mcp_test',
        },
    });

const connectClient = async (context: OperationContext) => {
    const server = createBidBeaconMcpServer(context);
    const client = new Client({ name: 'bidbeacon-mcp-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    return {
        client,
        close: async () => {
            await client.close();
            await server.close();
        },
    };
};

const parseText = (result: unknown) => {
    const content = typeof result === 'object' && result !== null && 'content' in result && Array.isArray(result.content) ? result.content : [];
    const text = content.find((entry): entry is { type: 'text'; text: string } => isTextContent(entry))?.text;
    if (!text) {
        throw new Error('MCP result did not contain text content.');
    }
    return JSON.parse(text) as unknown;
};

const isTextContent = (content: unknown): content is CallToolResult['content'][number] & { type: 'text'; text: string } => {
    return typeof content === 'object' && content !== null && 'type' in content && content.type === 'text' && 'text' in content && typeof content.text === 'string';
};

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const cliSource = join(repoRoot, 'packages/bidbeacon-cli/src/index.ts');
const accountId = '00000000-0000-4000-8000-000000000001';
const tempPaths: string[] = [];
type RecordedRequest = { path: string; input: Record<string, unknown> };
type FixtureResponse = { statusCode?: number; payload: unknown };
type FixtureResponder = (request: RecordedRequest, index: number) => FixtureResponse | undefined;

describe('canonical bb public contract', () => {
    afterEach(async () => {
        await Promise.all(tempPaths.splice(0).map(path => rm(path, { recursive: true, force: true })));
    });

    it('serializes Search, follows --all cursors, and emits only the final JSON array', async () => {
        const requests: Array<{ path: string; input: Record<string, unknown> }> = [];
        const server = await startFixtureServer(requests);
        try {
            const result = await runCli(server, [
                'search',
                'campaign',
                '--account',
                accountId,
                '--fields',
                'campaign.id,metrics.orders',
                '--where',
                'campaign.state in ["ENABLED","PAUSED"]',
                '--where',
                'metrics.orders>=2',
                '--order-by',
                'metrics.orders:desc',
                '--limit',
                '1',
                '--all',
            ]);

            expect(result.stderr).toBe('');
            expect(JSON.parse(result.stdout)).toEqual([{ 'campaign.id': 'campaign-1' }, { 'campaign.id': 'campaign-2' }]);
            expect(requests).toHaveLength(2);
            expect(requests[0]?.path).toBe('/api/search');
            expect(requests[0]?.input).toMatchObject({
                accountId,
                resource: 'campaign',
                fields: ['campaign.id', 'metrics.orders'],
                filters: [
                    { field: 'campaign.state', operator: 'in', value: ['ENABLED', 'PAUSED'] },
                    { field: 'metrics.orders', operator: 'gte', value: 2 },
                ],
                orderBy: [{ field: 'metrics.orders', direction: 'desc' }],
                limit: 1,
            });
            expect(requests[1]?.input.cursor).toBe('cursor-1');
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('serializes one atomic Performance request without pagination controls', async () => {
        const requests: RecordedRequest[] = [];
        const response = {
            context: {
                account: { id: accountId, timezone: 'America/Los_Angeles', currency: 'USD' },
                dimension: 'product',
                interval: 'day',
                metrics: ['spend'],
                dateRange: { startDate: '2026-08-01', endDate: '2026-08-02' },
                coverage: { status: 'COMPLETE', issues: [] },
            },
            series: [],
        };
        const server = await startFixtureServer(requests, request => (request.path === '/api/performance' ? { payload: { result: { data: response } } } : undefined));
        try {
            const result = await runCli(server, [
                'performance',
                '--account',
                accountId,
                '--dimension',
                'product',
                '--entity-ids',
                'B0ABC12345,B0DEF67890',
                '--interval',
                'day',
                '--start-date',
                '2026-08-01',
                '--end-date',
                '2026-08-02',
                '--metrics',
                'spend',
            ]);

            expect(result.code).toBe(0);
            expect(result.stderr).toBe('');
            expect(JSON.parse(result.stdout)).toEqual(response);
            expect(requests).toEqual([
                {
                    path: '/api/performance',
                    input: {
                        accountId,
                        dimension: 'product',
                        entityIds: ['B0ABC12345', 'B0DEF67890'],
                        interval: 'day',
                        dateRange: { startDate: '2026-08-01', endDate: '2026-08-02' },
                        metrics: ['spend'],
                    },
                },
            ]);
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('rejects scoped commands without --account and leaves stdout empty', async () => {
        const result = await runCli(null, ['search', 'campaign']);

        expect(result.code).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    });

    it('emits the stable authentication envelope and exits normally when credentials are missing', async () => {
        const result = await runCli(null, ['search', 'campaign', '--account', accountId], { apiKey: null });

        expect(result.code).not.toBe(0);
        expect(result.signal).toBeNull();
        expect(result.stdout).toBe('');
        expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'AUTHENTICATION_REQUIRED', details: {} } });
    });

    it('rejects duplicate properties across JSON and flags before making a request', async () => {
        const server = await startFixtureServer([]);
        try {
            const result = await runCli(server, [
                'update',
                'target',
                '--account',
                accountId,
                '--target-id',
                'target-1',
                '--state',
                'PAUSED',
                '--json',
                JSON.stringify({ changes: { state: 'ENABLED' } }),
            ]);

            expect(result.code).not.toBe(0);
            expect(result.stdout).toBe('');
            expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('rejects unsupported Search vocabulary and syntax locally', async () => {
        const requests: RecordedRequest[] = [];
        const server = await startFixtureServer(requests);
        try {
            const result = await runCli(server, ['search', 'campaign', '--account', accountId, '--where', 'metrics.unknown!=1']);

            expect(result.code).not.toBe(0);
            expect(result.stdout).toBe('');
            expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
            expect(requests).toHaveLength(0);
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('requires exact word-operator spacing and preserves structured equality values', async () => {
        const requests: RecordedRequest[] = [];
        const server = await startFixtureServer(requests);
        try {
            const ambiguous = await runCli(server, ['search', 'campaign', '--account', accountId, '--where', 'campaign.namein["Example"]']);

            expect(ambiguous.code).not.toBe(0);
            expect(ambiguous.stdout).toBe('');
            expect(JSON.parse(ambiguous.stderr)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
            expect(requests).toHaveLength(0);

            const structured = await runCli(server, ['search', 'change-event', '--account', accountId, '--where', 'changeEvent.newValue={"state":"PAUSED"}']);

            expect(structured.code).toBe(0);
            expect(structured.stderr).toBe('');
            expect(requests).toHaveLength(1);
            expect(requests[0]?.input).toMatchObject({
                accountId,
                resource: 'change_event',
                filters: [{ field: 'changeEvent.newValue', operator: 'eq', value: { state: 'PAUSED' } }],
            });
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('rejects underscore resource aliases locally', async () => {
        const requests: RecordedRequest[] = [];
        const server = await startFixtureServer(requests);
        try {
            for (const resource of ['ad_group', 'change_event']) {
                const result = await runCli(server, ['search', resource, '--account', accountId]);
                expect(result.code).not.toBe(0);
                expect(result.stdout).toBe('');
                expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
            }
            expect(requests).toHaveLength(0);
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('buffers --all output across late failures and terminates repeated cursor cycles', async () => {
        const lateFailureRequests: RecordedRequest[] = [];
        const lateFailureServer = await startFixtureServer(lateFailureRequests, (request, index) =>
            index === 0
                ? {
                      payload: searchSuccess(request.input, [{ 'campaign.id': 'campaign-1' }], 'cursor-1'),
                  }
                : operationFailure('AMAZON_UNAVAILABLE', 'Amazon remained unavailable.', { attempt: 3 })
        );
        try {
            const result = await runCli(lateFailureServer, ['search', 'campaign', '--account', accountId, '--all']);
            expect(result.code).not.toBe(0);
            expect(result.stdout).toBe('');
            expect(JSON.parse(result.stderr)).toEqual({
                error: {
                    code: 'AMAZON_UNAVAILABLE',
                    message: 'Amazon remained unavailable.',
                    details: { attempt: 3 },
                },
            });
            expect(lateFailureRequests).toHaveLength(2);
        } finally {
            await closeFixtureServer(lateFailureServer);
        }

        const cycleRequests: RecordedRequest[] = [];
        const cycleServer = await startFixtureServer(cycleRequests, request => ({
            payload: searchSuccess(request.input, [{ 'campaign.id': 'campaign-1' }], 'cursor-1'),
        }));
        try {
            const result = await runCli(cycleServer, ['search', 'campaign', '--account', accountId, '--all']);
            expect(result.code).not.toBe(0);
            expect(result.stdout).toBe('');
            expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: 'CURSOR_INVALID' } });
            expect(cycleRequests).toHaveLength(2);
        } finally {
            await closeFixtureServer(cycleServer);
        }
    });

    it('accepts literal, file, and stdin JSON while rejecting nested duplicate assignment', async () => {
        const requests: RecordedRequest[] = [];
        const server = await startFixtureServer(requests);
        const tempDir = await mkdtemp(join(tmpdir(), 'bidbeacon-cli-json-'));
        tempPaths.push(tempDir);
        const campaignPath = join(tempDir, 'campaign.json');
        await writeFile(
            campaignPath,
            JSON.stringify({
                name: 'File campaign',
                state: 'PAUSED',
                dailyBudget: 10,
                bidStrategy: 'FIXED',
                targetingMode: 'AUTO',
                startDate: '2026-08-07',
            })
        );
        try {
            const literal = await runCli(server, ['update', 'target', '--account', accountId, '--json', '{"targetId":"target-1","changes":{"state":"PAUSED"}}']);
            const file = await runCli(server, ['create', 'campaign', '--account', accountId, '--json', `@${campaignPath}`]);
            const stdin = await runCli(server, ['create', 'sponsored-products-campaign', '--account', accountId, '--json', '-'], {
                input: JSON.stringify({
                    campaign: { name: 'Stdin campaign', state: 'PAUSED', dailyBudget: 10, bidStrategy: 'FIXED' },
                    adGroup: { name: 'Default', defaultBid: 0.5 },
                    asins: ['B0ABCDEF12'],
                    targeting: { mode: 'AUTO' },
                }),
            });
            const duplicate = await runCli(server, [
                'update',
                'campaign',
                '--account',
                accountId,
                '--campaign-id',
                'campaign-1',
                '--placement-bid-adjustments',
                '{"topOfSearch":50}',
                '--json',
                '{"changes":{"placementBidAdjustments":{"productPages":20}}}',
            ]);

            expect([literal.code, file.code, stdin.code]).toEqual([0, 0, 0]);
            expect(requests.map(request => request.path)).toEqual(['/api/update_target', '/api/create_campaign', '/api/create_sponsored_products_campaign']);
            expect(requests[0]?.input).toEqual({ accountId, targetId: 'target-1', changes: { state: 'PAUSED' } });
            expect(requests[1]?.input).toMatchObject({ accountId, name: 'File campaign' });
            expect(requests[2]?.input).toMatchObject({ accountId, campaign: { name: 'Stdin campaign' } });
            expect(duplicate.code).not.toBe(0);
            expect(duplicate.stdout).toBe('');
            expect(JSON.parse(duplicate.stderr)).toMatchObject({
                error: { code: 'INVALID_INPUT', details: { property: 'changes.placementBidAdjustments' } },
            });
            expect(requests).toHaveLength(3);
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('normalizes network and tRPC operation failures without stdout noise', async () => {
        const network = await runCli(null, ['search', 'campaign', '--account', accountId]);
        expect(network.code).not.toBe(0);
        expect(network.stdout).toBe('');
        expect(JSON.parse(network.stderr)).toMatchObject({ error: { code: 'INTERNAL_ERROR', details: {} } });

        const requests: RecordedRequest[] = [];
        const server = await startFixtureServer(requests, () => operationFailure('ACCOUNT_ACCESS_DENIED', 'The caller cannot access this Advertiser Account.', {}));
        try {
            const denied = await runCli(server, ['search', 'campaign', '--account', accountId]);
            expect(denied.code).not.toBe(0);
            expect(denied.stdout).toBe('');
            expect(JSON.parse(denied.stderr)).toEqual({
                error: {
                    code: 'ACCOUNT_ACCESS_DENIED',
                    message: 'The caller cannot access this Advertiser Account.',
                    details: {},
                },
            });
        } finally {
            await closeFixtureServer(server);
        }
    });

    it('keeps legacy commands out of help', async () => {
        const result = await runCli(null, ['--help']);
        const createHelp = await runCli(null, ['create', '--help']);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('advertiser-accounts list');
        expect(result.stdout).toContain('search <resource>');
        expect(result.stdout).toContain('performance');
        expect(createHelp.stdout).toContain('sponsored-products-campaign');
        expect(result.stdout).not.toContain('campaigns list');
        expect(result.stdout).not.toContain('metrics');
        expect(result.stdout).not.toContain('asins');
        expect(result.stdout).not.toContain('history');
    });
});

const runCli = async (server: { port: number } | null, args: string[], options: { apiKey?: string | null; input?: string } = {}) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'bidbeacon-cli-contract-'));
    tempPaths.push(tempDir);
    await mkdir(tempDir, { recursive: true });

    return new Promise<{ code: number; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(resolveResult => {
        const child = execFile(
            'bun',
            [cliSource, ...args],
            {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    HOME: tempDir,
                    MERCHBASE_API_KEY: options.apiKey === null ? '' : (options.apiKey ?? 'ak_fixture'),
                    BB_BASE_URL: server ? `http://127.0.0.1:${server.port}` : 'http://127.0.0.1:1',
                },
                maxBuffer: 2_000_000,
                timeout: 5000,
            },
            (error, stdout, stderr) => {
                const result = error as { code?: number; signal?: NodeJS.Signals | null } | null;
                resolveResult({
                    code: error ? (typeof result?.code === 'number' ? result.code : 1) : 0,
                    signal: result?.signal ?? null,
                    stdout,
                    stderr,
                });
            }
        );
        child.stdin?.end(options.input);
    });
};

const startFixtureServer = async (requests: RecordedRequest[], responder?: FixtureResponder) => {
    const server = createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const rawInput = url.searchParams.get('input') ?? (await readRequestBody(request));
        const inputEnvelope = rawInput ? (JSON.parse(rawInput) as { json?: Record<string, unknown>; '0'?: { json?: Record<string, unknown> } }) : { json: {} };
        const candidate = inputEnvelope.json ?? inputEnvelope['0'] ?? {};
        const input = 'json' in candidate ? (candidate.json ?? {}) : candidate;
        const recordedRequest = { path: url.pathname, input };
        requests.push(recordedRequest);
        const customResponse = responder?.(recordedRequest, requests.length - 1);
        if (customResponse) {
            response.writeHead(customResponse.statusCode ?? 200, { 'content-type': 'application/json' });
            response.end(JSON.stringify(customResponse.payload));
            return;
        }
        const isSecondPage = input.cursor === 'cursor-1';
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(searchSuccess(input, isSecondPage ? [{ 'campaign.id': 'campaign-2' }] : [{ 'campaign.id': 'campaign-1' }], isSecondPage ? undefined : 'cursor-1')));
    });
    await new Promise<void>(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
    const address = server.address();
    if (!address || typeof address === 'string') {
        await closeFixtureServer(server);
        throw new Error('Fixture server did not expose a TCP port.');
    }
    return { server, port: address.port };
};

const searchSuccess = (input: Record<string, unknown>, rows: Record<string, unknown>[], nextCursor?: string) => ({
    result: {
        data: {
            context: {
                account: { id: accountId, timezone: 'America/Los_Angeles', currency: 'USD' },
                resource: input.resource ?? 'campaign',
                fields: input.fields ?? ['campaign.id'],
                orderBy: input.orderBy ?? [{ field: 'campaign.id', direction: 'asc' }],
            },
            rows,
            ...(nextCursor ? { nextCursor } : {}),
        },
    },
});

const operationFailure = (operationCode: string, message: string, details: Record<string, unknown>): FixtureResponse => ({
    statusCode: operationCode === 'ACCOUNT_ACCESS_DENIED' ? 403 : 504,
    payload: {
        error: {
            message,
            code: operationCode === 'ACCOUNT_ACCESS_DENIED' ? -32_003 : -32_608,
            data: {
                code: operationCode === 'ACCOUNT_ACCESS_DENIED' ? 'FORBIDDEN' : 'TIMEOUT',
                httpStatus: operationCode === 'ACCOUNT_ACCESS_DENIED' ? 403 : 504,
                path: 'search',
                operationCode,
                details,
            },
        },
    },
});

const closeFixtureServer = async (fixture: { server: Server }) => {
    await new Promise<void>((resolveServer, reject) => fixture.server.close(error => (error ? reject(error) : resolveServer())));
};

const readRequestBody = async (request: Parameters<NonNullable<Server['on']>>[1] extends never ? never : NodeJS.ReadableStream) => {
    let body = '';
    for await (const chunk of request) {
        body += String(chunk);
    }
    return body;
};

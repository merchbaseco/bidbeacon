import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ensureChrome, fillLabel, navigate, pageText, screenshot, sessionToken } from './chrome-session';
import { amazonWriteRefusal, DASHBOARD_PORTS, SEED_ACCOUNT_NAME, type VerifyRun } from './constants';
import { ensurePostgres, ensureSeed, psql, seedAccountName } from './postgres';
import { readRun, updateRun, writeRun } from './run-file';

const repoRoot = join(import.meta.dir, '../../..');
const allowedDashboardPorts: readonly number[] = DASHBOARD_PORTS;

const main = async () => {
    const [command, ...args] = process.argv.slice(2);
    switch (command) {
        case 'launch':
            await launch(args);
            return;
        case 'doctor':
            await doctor();
            return;
        case 'browser':
            await browser(args);
            return;
        case 'http':
            await http(args);
            return;
        case 'mcp':
            await mcp(args);
            return;
        case 'cli':
            await cli(args);
            return;
        case 'cleanup':
            await cleanup();
            return;
        default:
            process.stderr.write('Commands: launch, doctor, browser, http, mcp, cli, worker, cleanup.\n');
            process.exit(2);
    }
};

const launch = async (args: string[]) => {
    const apiPort = flagNumber(args, '--api-port') ?? 8080;
    const dashboardPort = flagNumber(args, '--dashboard-port') ?? 4173;
    if (!allowedDashboardPorts.includes(dashboardPort)) {
        throw new Error(`Dashboard port ${dashboardPort} cannot sign in. Clerk authorized parties allow only 4173 and 4174.`);
    }
    await ensurePostgres();
    const seed = await ensureSeed(repoRoot);
    const id = Date.now().toString(36);
    const dir = join('/tmp/bidbeacon-verify/runs', id);
    const evidenceDir = join('/tmp/bidbeacon-verify/evidence', id);
    await mkdir(dir, { recursive: true });
    await mkdir(evidenceDir, { recursive: true });
    const run: VerifyRun = {
        apiBase: `http://127.0.0.1:${apiPort}`,
        apiPid: null,
        apiPort,
        chromeDir: null,
        chromePid: null,
        dashboardBase: `http://127.0.0.1:${dashboardPort}`,
        dashboardPid: null,
        dashboardPort,
        dir,
        evidenceDir,
        id,
        owned: false,
        tokenPath: join(dir, 'session.token'),
    };
    await writeRun(run);
    const api = await adoptOrStart(run, 'api');
    const dashboard = await adoptOrStart(run, 'dashboard');
    const started = await updateRun({ apiPid: api.pid, dashboardPid: dashboard.pid, owned: api.started || dashboard.started });
    await waitUntilReady(started);
    const report = await doctorReport(started);
    process.stdout.write(`${JSON.stringify({ ...report, seed }, null, 2)}\n`);
};

const doctor = async () => {
    const run = await readRun();
    await waitUntilReady(run);
    process.stdout.write(`${JSON.stringify(await doctorReport(run), null, 2)}\n`);
};

const browser = async (args: string[]) => {
    const sub = args[0];
    let run = await readRun();
    if (sub === 'open') {
        run = await ensureChrome(run);
        await navigate(run, flag(args, '--url') ?? `${run.dashboardBase}/`);
        process.stdout.write(`${flag(args, '--url') ?? run.dashboardBase}\n`);
        return;
    }
    if (sub === 'wait') {
        const text = flag(args, '--text');
        if (!text) {
            throw new Error('browser wait requires --text.');
        }
        const body = await pollText(run, text, flag(args, '--absent'));
        const path = await writeEvidence(run, flag(args, '--path') ?? 'browser/page.txt', body);
        process.stdout.write(`${path}\n`);
        return;
    }
    if (sub === 'fill') {
        const label = flag(args, '--label');
        const value = flag(args, '--value');
        if (!(label && value !== undefined)) {
            throw new Error('browser fill requires --label and --value.');
        }
        await fillLabel(run, label, value);
        process.stdout.write(`${label}\n`);
        return;
    }
    if (sub === 'screenshot') {
        const path = await writeEvidence(run, flag(args, '--path') ?? 'browser/page.png', await screenshot(run));
        process.stdout.write(`${path}\n`);
        return;
    }
    if (sub === 'text') {
        const path = await writeEvidence(run, flag(args, '--path') ?? 'browser/page.txt', await pageText(run));
        process.stdout.write(`${path}\n`);
        return;
    }
    if (sub === 'token') {
        await writeFile(run.tokenPath, await pollToken(run), { mode: 0o600 });
        process.stdout.write(`${run.tokenPath}\n`);
        return;
    }
    throw new Error('browser subcommands: open, wait, fill, screenshot, text, token.');
};

const http = async (args: string[]) => {
    const procedure = args[1];
    if (args[0] !== 'get' || !procedure) {
        throw new Error('Use http get <procedure> --input <json> [--expect <text>] [--path <file>].');
    }
    refuseAmazon(procedure);
    const run = await readRun();
    const token = (await readFile(run.tokenPath, 'utf8')).trim();
    const input = JSON.parse(flag(args, '--input') ?? '{}') as unknown;
    const response = await fetch(`${run.apiBase}/api/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.text();
    const path = await writeEvidence(run, flag(args, '--path') ?? `http/${procedure}.json`, `${response.status}\n${body}\n`);
    const expect = flag(args, '--expect');
    if (!response.ok || (expect && !body.includes(expect))) {
        process.stderr.write(`${procedure} failed. Evidence: ${path}\n`);
        process.exit(1);
    }
    process.stdout.write(`${path}\n`);
};

const mcp = async (args: string[]) => {
    const tool = args[1];
    if (args[0] !== 'call' || !tool) {
        throw new Error('Use mcp call <tool> [--input <json>] [--expect <text>] [--path <file>].');
    }
    refuseAmazon(tool);
    const run = await readRun();
    const token = (await readFile(run.tokenPath, 'utf8')).trim();
    const input = JSON.parse(flag(args, '--input') ?? '{}') as Record<string, unknown>;
    const client = new Client({ name: 'verify-bidbeacon', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${run.apiBase}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    let body: string;
    try {
        await client.connect(transport);
        body = JSON.stringify(await client.callTool({ arguments: input, name: tool }), null, 2);
        await client.close();
    } catch (error) {
        body = error instanceof Error ? error.message : String(error);
        const path = await writeEvidence(run, flag(args, '--path') ?? `mcp/${tool}.json`, body);
        process.stderr.write(`MCP ${tool} failed. Evidence: ${path}\n`);
        process.exit(1);
    }
    const path = await writeEvidence(run, flag(args, '--path') ?? `mcp/${tool}.json`, body);
    const expect = flag(args, '--expect');
    if (expect && !body.includes(expect)) {
        process.stderr.write(`MCP ${tool} missed ${expect}. Evidence: ${path}\n`);
        process.exit(1);
    }
    process.stdout.write(`${path}\n`);
};

const cli = async (args: string[]) => {
    const separator = args.indexOf('--');
    const commandArgs = separator === -1 ? args : args.slice(separator + 1);
    if (commandArgs[0] === 'create' || commandArgs[0] === 'update') {
        refuseAmazon(`${commandArgs[0]}_campaign`);
    }
    for (const arg of commandArgs) {
        refuseAmazon(arg);
    }
    const run = await readRun();
    const storage = join(run.dir, 'bb-storage');
    await mkdir(storage, { recursive: true });
    const env = { ...process.env, BB_BASE_URL: run.apiBase, BB_STORAGE_DIR: storage, MERCHBASE_API_KEY: '' };
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn('bun', ['packages/bidbeacon-cli/src/index.ts', ...commandArgs], { cwd: repoRoot, env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => {
            stdout += String(chunk);
        });
        child.stderr.on('data', chunk => {
            stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('close', code => resolve({ code: code ?? 1, stderr, stdout }));
    });
    const slug = (commandArgs[0] ?? 'bb').replace(/[^a-z0-9-]+/gi, '-');
    const path = await writeEvidence(run, `cli/${slug}.txt`, `exit ${result.code}\n${result.stdout}\n${result.stderr}\n`);
    process.stdout.write(`${path}\n`);
    if (result.code !== 0) {
        process.exit(result.code);
    }
};

const cleanup = async () => {
    const run = await readRun().catch(() => null);
    if (!run) {
        process.stdout.write('No verification run.\n');
        return;
    }
    stopPid(run.apiPid);
    stopPid(run.dashboardPid);
    stopPid(run.chromePid);
    await psql("DELETE FROM ams_sp_traffic WHERE idempotency_id = 'verify-bidbeacon-sp-traffic'").catch(() => undefined);
    await rm(run.dir, { force: true, recursive: true });
    await rm('/tmp/bidbeacon-verify/run.json', { force: true });
    process.stdout.write(`${run.evidenceDir}\n`);
};

const doctorReport = async (run: VerifyRun) => {
    const liveResponse = await fetch(`${run.apiBase}/api/live`);
    const live = (await liveResponse.json()) as { service?: string; status?: string };
    const dashboardResponse = await fetch(`${run.dashboardBase}/`);
    const dashboardTitle = (await dashboardResponse.text()).includes('BidBeacon Dashboard');
    const account = await seedAccountName();
    const refusal = amazonWriteRefusal('create_campaign');
    const started = [run.apiPid, run.dashboardPid].filter((pid): pid is number => pid !== null);
    const alive = started.every(pidAlive);
    const ok = liveResponse.status === 200 && live.service === 'bidbeacon-server' && dashboardResponse.status === 200 && dashboardTitle && account === SEED_ACCOUNT_NAME && refusal !== null && alive;
    if (!ok) {
        process.stderr.write(`${JSON.stringify({ account, alive, dashboardTitle, live, refusal }, null, 2)}\n`);
        process.exit(1);
    }
    return {
        account,
        amazonWriteGuard: refusal,
        apiBase: run.apiBase,
        dashboardBase: run.dashboardBase,
        evidenceDir: run.evidenceDir,
        live,
        ok: true,
        owned: run.owned,
    };
};

const adoptOrStart = async (run: VerifyRun, kind: 'api' | 'dashboard') => {
    const port = kind === 'api' ? run.apiPort : run.dashboardPort;
    if (await portOpen(port)) {
        const healthy = kind === 'api' ? await apiHealthy(run.apiBase) : await dashboardHealthy(run.dashboardBase);
        if (!healthy) {
            throw new Error(`Port ${port} is open and it is not a BidBeacon ${kind}.`);
        }
        return { pid: null, started: false };
    }
    const logPath = join(run.dir, `${kind}.log`);
    const log = openSync(logPath, 'a');
    const env = {
        ...process.env,
        BIDBEACON_DASHBOARD_API_PROXY_TARGET: run.apiBase,
        BIDBEACON_DATABASE_HOST: '127.0.0.1',
        BIDBEACON_DEV_HOST: '127.0.0.1',
        BIDBEACON_PORT: String(run.apiPort),
    };
    const command = kind === 'api' ? ['tsx', 'src/index.ts'] : ['vite', 'dev', '--config', 'vite.config.dashboard.ts', '--port', String(run.dashboardPort), '--strictPort', '--host', '127.0.0.1'];
    const child = spawn('bunx', command, { cwd: repoRoot, detached: true, env, stdio: ['ignore', log, log] });
    child.unref();
    if (!child.pid) {
        throw new Error(`Unable to start the ${kind}.`);
    }
    return { pid: child.pid, started: true };
};

const waitUntilReady = async (run: VerifyRun) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
        if ((await apiHealthy(run.apiBase)) && (await dashboardHealthy(run.dashboardBase))) {
            return;
        }
        await delay(1000);
    }
    throw new Error(`BidBeacon did not become ready at ${run.apiBase} and ${run.dashboardBase}. See ${run.dir}/api.log and ${run.dir}/dashboard.log.`);
};

const apiHealthy = async (apiBase: string) => {
    try {
        const response = await fetch(`${apiBase}/api/live`);
        if (!response.ok) {
            return false;
        }
        const body = (await response.json()) as { service?: string };
        return body.service === 'bidbeacon-server';
    } catch {
        return false;
    }
};

const dashboardHealthy = async (dashboardBase: string) => {
    try {
        const response = await fetch(`${dashboardBase}/`);
        return response.ok && (await response.text()).includes('BidBeacon Dashboard');
    } catch {
        return false;
    }
};

const pollText = async (run: VerifyRun, text: string, absent?: string) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const body = await pageText(run).catch(() => '');
        if (body.includes(text) && !(absent && body.includes(absent))) {
            return body;
        }
        await delay(500);
    }
    throw new Error(absent ? `Page did not show ${text} without ${absent}.` : `Page did not show ${text}.`);
};

const pollToken = async (run: VerifyRun) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const token = await sessionToken(run).catch(() => '');
        if (token.split('.').length === 3) {
            return token;
        }
        await delay(500);
    }
    throw new Error('Clerk session token was not available. Open the dashboard on 127.0.0.1 port 4173 or 4174 and wait for dev sign-in.');
};

const writeEvidence = async (run: VerifyRun, relativePath: string, body: string | Uint8Array) => {
    const path = join(run.evidenceDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return path;
};

const refuseAmazon = (name: string) => {
    const refusal = amazonWriteRefusal(name);
    if (!refusal) {
        return;
    }
    process.stderr.write(`${refusal}\n`);
    process.exit(2);
};

const flag = (args: string[], name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
};

const flagNumber = (args: string[], name: string) => {
    const value = flag(args, name);
    if (!value) {
        return undefined;
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`${name} must be a port.`);
    }
    return port;
};

const portOpen = (port: number) =>
    new Promise<boolean>(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port });
        const finish = (open: boolean) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(open);
        };
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
    });

const pidAlive = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const stopPid = (pid: number | null) => {
    if (!pid) {
        return;
    }
    try {
        process.kill(-pid, 'SIGTERM');
    } catch {
        try {
            process.kill(pid, 'SIGTERM');
        } catch {
            return;
        }
    }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});

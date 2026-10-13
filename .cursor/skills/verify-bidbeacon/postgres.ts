import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import net from 'node:net';
import { SEED_ACCOUNT_NAME, SEED_ADS_ACCOUNT_ID } from './constants';

export const postgresReady = () =>
    new Promise<boolean>(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port: 5432 });
        const finish = (ready: boolean) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(ready);
        };
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
    });

export const ensurePostgres = async () => {
    if (await postgresReady()) {
        return;
    }
    const versions = await readdir('/etc/postgresql').catch(() => []);
    const version = versions.sort().at(-1);
    if (!version) {
        throw new Error('PostgreSQL is not accepting connections on 127.0.0.1:5432 and /etc/postgresql has no cluster to start.');
    }
    await runCommand('sudo', ['pg_ctlcluster', version, 'main', 'start']);
    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await postgresReady()) {
            return;
        }
        await delay(1000);
    }
    throw new Error('PostgreSQL did not become ready on 127.0.0.1:5432.');
};

export const psql = async (sql: string) => {
    const user = process.env.BIDBEACON_DATABASE_USER;
    const database = process.env.BIDBEACON_DATABASE_NAME;
    const password = process.env.BIDBEACON_DATABASE_PASSWORD;
    if (!(user && database && password)) {
        throw new Error('BIDBEACON_DATABASE_USER, BIDBEACON_DATABASE_NAME, and BIDBEACON_DATABASE_PASSWORD must be resolved before querying.');
    }
    return runCommand('psql', ['-h', '127.0.0.1', '-p', '5432', '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], {
        PGPASSWORD: password,
    });
};

export const seedAccountName = async () => {
    const result = await psql(`SELECT account_name FROM advertiser_account WHERE ads_account_id = '${SEED_ADS_ACCOUNT_ID}' AND country_code = 'US'`);
    if (result.code !== 0) {
        throw new Error(result.stderr || 'Unable to read the seeded advertiser account.');
    }
    return result.stdout;
};

export const ensureSeed = async (repoRoot: string) => {
    const name = await seedAccountName().catch(() => '');
    if (name === SEED_ACCOUNT_NAME) {
        return 'present' as const;
    }
    const seed = await runCommand('bunx', ['tsx', 'scripts/seed-dev-data.ts'], {}, repoRoot);
    if (seed.code !== 0) {
        throw new Error(seed.stderr || seed.stdout || 'Seed failed.');
    }
    const seeded = await seedAccountName();
    if (seeded !== SEED_ACCOUNT_NAME) {
        throw new Error(`Seed finished but account name was ${seeded || 'empty'}.`);
    }
    return 'seeded' as const;
};

const runCommand = (command: string, args: string[], extraEnv: Record<string, string> = {}, cwd?: string) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env: { ...process.env, ...extraEnv },
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', chunk => {
            stdout += String(chunk);
        });
        child.stderr?.on('data', chunk => {
            stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('close', code => {
            resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
        });
    });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

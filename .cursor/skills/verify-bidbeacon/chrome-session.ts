import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VerifyRun } from './constants';
import { updateRun } from './run-file';

type CdpResult = {
    result?: { value?: unknown };
    exceptionDetails?: unknown;
    data?: string;
};

export const ensureChrome = async (run: VerifyRun) => {
    if (run.chromePid && run.chromeDir && (await chromePort(run.chromeDir).catch(() => null))) {
        return run;
    }
    const chromeDir = join(run.dir, 'chrome');
    await mkdir(chromeDir, { recursive: true });
    const child = spawn(
        'google-chrome',
        [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-data-dir=${chromeDir}`,
            '--remote-debugging-port=0',
            'about:blank',
        ],
        { detached: true, stdio: 'ignore' }
    );
    child.unref();
    if (!child.pid) {
        throw new Error('Chrome did not return a pid.');
    }
    const next = await updateRun({ chromeDir, chromePid: child.pid });
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const port = await chromePort(chromeDir).catch(() => null);
        if (port) {
            return next;
        }
        await delay(250);
    }
    throw new Error('Chrome did not write DevToolsActivePort.');
};

export const withPage = async <T>(run: VerifyRun, fn: (send: CdpSend) => Promise<T>) => {
    if (!run.chromeDir) {
        throw new Error('Chrome is not started. Run browser open first.');
    }
    const port = await chromePort(run.chromeDir);
    const list = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
    const page = list.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
    if (!page?.webSocketDebuggerUrl) {
        throw new Error('Chrome has no page target.');
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => resolve(), { once: true });
        ws.addEventListener('error', () => reject(new Error('Chrome DevTools socket failed.')), { once: true });
    });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: CdpResult) => void; reject: (error: Error) => void }>();
    ws.addEventListener('message', event => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: CdpResult; error?: { message?: string } };
        if (!(message.id && pending.has(message.id))) {
            return;
        }
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (!waiter) {
            return;
        }
        if (message.error) {
            waiter.reject(new Error(message.error.message || 'Chrome DevTools command failed.'));
            return;
        }
        waiter.resolve(message.result ?? {});
    });
    const send: CdpSend = (method, params) =>
        new Promise((resolve, reject) => {
            nextId += 1;
            pending.set(nextId, { resolve, reject });
            ws.send(JSON.stringify({ id: nextId, method, params }));
        });
    try {
        await send('Page.enable');
        await send('Runtime.enable');
        return await fn(send);
    } finally {
        ws.close();
    }
};

export const navigate = async (run: VerifyRun, url: string) => {
    await withPage(run, async send => {
        await send('Page.navigate', { url });
    });
};

export const pageText = async (run: VerifyRun) => {
    const value = await evaluate(run, 'document.body ? document.body.innerText : ""');
    return typeof value === 'string' ? value : '';
};

export const fillLabel = async (run: VerifyRun, label: string, value: string) => {
    const expression = `(() => {
        const field = document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});
        if (!(field instanceof HTMLInputElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(field, ${JSON.stringify(value)});
        field.dispatchEvent(new Event('input', { bubbles: true }));
        return field.value === ${JSON.stringify(value)};
    })()`;
    const filled = await evaluate(run, expression);
    if (filled !== true) {
        throw new Error(`No input named ${label}.`);
    }
};

export const sessionToken = async (run: VerifyRun) => {
    const value = await evaluate(
        run,
        `(async () => {
            const clerk = window.Clerk;
            if (!clerk || !clerk.session || !clerk.session.getToken) return '';
            const token = await clerk.session.getToken();
            return typeof token === 'string' ? token : '';
        })()`,
        true
    );
    return typeof value === 'string' ? value : '';
};

export const screenshot = async (run: VerifyRun) => {
    const result = await withPage(run, send => send('Page.captureScreenshot', { format: 'png' }));
    if (!result.data) {
        throw new Error('Chrome did not return a screenshot.');
    }
    return Buffer.from(result.data, 'base64');
};

const evaluate = async (run: VerifyRun, expression: string, awaitPromise = false) => {
    const result = await withPage(run, send => send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }));
    if (result.exceptionDetails) {
        throw new Error('Page evaluation failed.');
    }
    return result.result?.value;
};

const chromePort = async (chromeDir: string) => {
    const body = await readFile(join(chromeDir, 'DevToolsActivePort'), 'utf8');
    const port = Number(body.split('\n')[0]);
    if (!Number.isInteger(port) || port < 1) {
        throw new Error('DevToolsActivePort did not contain a port.');
    }
    return port;
};

type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResult>;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

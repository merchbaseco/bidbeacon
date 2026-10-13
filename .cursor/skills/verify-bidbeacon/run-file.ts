import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { RUN_PATH, type VerifyRun } from './constants';

export const readRun = async () => {
    try {
        const body = await readFile(RUN_PATH, 'utf8');
        return JSON.parse(body) as VerifyRun;
    } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (code === 'ENOENT') {
            throw new Error(`No verification run at ${RUN_PATH}. Run launch first.`);
        }
        throw error;
    }
};

export const writeRun = async (run: VerifyRun) => {
    await mkdir(dirname(RUN_PATH), { recursive: true });
    await writeFile(RUN_PATH, `${JSON.stringify(run, null, 2)}\n`);
    return run;
};

export const updateRun = async (patch: Partial<VerifyRun>) => {
    const current = await readRun();
    return writeRun({ ...current, ...patch });
};

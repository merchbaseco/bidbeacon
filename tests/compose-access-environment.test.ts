import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(new URL('../compose.yml', import.meta.url), 'utf8');
const requiredAccessEnvironment = ['CLERK_AUTHORIZED_PARTIES', 'CLERK_ISSUER', 'CLERK_JWT_KEY', 'CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'];

describe('compose access runtime environment', () => {
    it('passes verifier credentials to every service that can run access-gated work', () => {
        const server = getServiceBlock('server', 'worker');
        const worker = getServiceBlock('worker', 'caddy');

        for (const variable of requiredAccessEnvironment) {
            expect(server).toContain(`      ${variable}:`);
            expect(worker).toContain(`      ${variable}:`);
        }

        expect(server).toContain(['      DISABLE_SERVER_JOB_RUNNER: $', '{DISABLE_SERVER_JOB_RUNNER:-false}'].join(''));
        expect(worker).not.toContain('CLERK_WEBHOOK_SIGNING_SECRET');
    });
});

const getServiceBlock = (service: string, nextService: string) => {
    const start = compose.indexOf(`  ${service}:\n`);
    const end = compose.indexOf(`\n  ${nextService}:\n`, start);

    if (start < 0 || end < 0) {
        throw new Error(`Could not isolate ${service} service in compose.yml.`);
    }

    return compose.slice(start, end);
};

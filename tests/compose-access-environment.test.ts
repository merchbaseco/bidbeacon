import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(new URL('../compose.yml', import.meta.url), 'utf8');
const composeDefaultFallbackPattern = /\$\{[A-Z][A-Z0-9_]*:-/u;
const requiredAccessEnvironment = ['BIDBEACON_CLERK_AUTHORIZED_PARTIES', 'MERCHBASE_CLERK_ISSUER', 'MERCHBASE_CLERK_JWT_KEY', 'MERCHBASE_CLERK_PUBLISHABLE_KEY', 'MERCHBASE_CLERK_SECRET_KEY'];

describe('compose access runtime environment', () => {
    it('passes verifier credentials to every service that can run access-gated work', () => {
        const server = getServiceBlock('server', 'worker');
        const worker = getServiceBlock('worker', 'caddy');

        for (const variable of requiredAccessEnvironment) {
            expect(server).toContain(`      - ${variable}`);
            expect(worker).toContain(`      - ${variable}`);
        }

        // Pass-through shorthand, not `${VAR}`: Compose interpolates what it
        // substitutes, which truncates any value containing a `$`.
        expect(server).toContain('      - BIDBEACON_DISABLE_SERVER_JOB_RUNNER');
        expect(compose).not.toMatch(composeDefaultFallbackPattern);
        expect(server).toContain('      - BIDBEACON_RANKWRANGLER_BASE_URL');
        expect(worker).not.toContain('BIDBEACON_CLERK_WEBHOOK_SIGNING_SECRET');
        expect(worker).not.toContain('BIDBEACON_RANKWRANGLER_BASE_URL');
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

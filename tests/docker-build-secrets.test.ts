import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../compose.yml', import.meta.url), 'utf8');
const privateArgOrEnvRegex = /^\s*(?:ARG|ENV)\s+.*(?:MERCHBASE_HUGEICONS_LICENSE_KEY|MERCHBASE_GITHUB_NPM_TOKEN)/m;
const privateEnvFileRegex = /(?:MERCHBASE_HUGEICONS_LICENSE_KEY|MERCHBASE_GITHUB_NPM_TOKEN).*>>\s*\.env/;
const hugeiconsSecretMountRegex = /id=hugeicons_license_key,env=MERCHBASE_HUGEICONS_LICENSE_KEY,required=true/g;
const merchbaseSecretMountRegex = /id=merchbase_npm_token,env=MERCHBASE_GITHUB_NPM_TOKEN,required=true/g;
const hugeiconsDockerfileNameRegex = /MERCHBASE_HUGEICONS_LICENSE_KEY/g;
const merchbaseDockerfileNameRegex = /MERCHBASE_GITHUB_NPM_TOKEN/g;
const hugeiconsComposeSecretRegex = /MERCHBASE_HUGEICONS_LICENSE_KEY/g;
const merchbaseComposeSecretRegex = /MERCHBASE_GITHUB_NPM_TOKEN/g;

describe('Docker build secret wiring', () => {
    it('uses ephemeral BuildKit secret mounts for private dependency credentials', () => {
        expect(dockerfile).not.toMatch(privateArgOrEnvRegex);
        expect(dockerfile).not.toMatch(privateEnvFileRegex);
        expect(dockerfile.match(hugeiconsSecretMountRegex)).toHaveLength(2);
        expect(dockerfile.match(merchbaseSecretMountRegex)).toHaveLength(2);
        expect(dockerfile.match(hugeiconsDockerfileNameRegex)).toHaveLength(2);
        expect(dockerfile.match(merchbaseDockerfileNameRegex)).toHaveLength(2);
        expect(dockerfile).toContain('bun install --frozen-lockfile');
        expect(dockerfile).toContain('bun install --frozen-lockfile --production');
        expect(dockerfile).toContain('ARG VITE_MERCHBASE_CLERK_PUBLISHABLE');
    });

    it('grants private secrets only to the server and caddy build definitions', () => {
        expect(compose.match(hugeiconsComposeSecretRegex)).toHaveLength(1);
        expect(compose.match(merchbaseComposeSecretRegex)).toHaveLength(1);
        expect(compose).toContain('hugeicons_license_key:\n    environment: MERCHBASE_HUGEICONS_LICENSE_KEY');
        expect(compose).toContain('merchbase_npm_token:\n    environment: MERCHBASE_GITHUB_NPM_TOKEN');

        for (const service of ['server', 'caddy']) {
            const serviceBlock = getServiceBlock(service, service === 'server' ? 'worker' : 'volumes');
            const build = getBuildBlock(service);
            expect(build).toContain('      secrets:\n        - hugeicons_license_key\n        - merchbase_npm_token');
            expect(build).not.toContain('MERCHBASE_HUGEICONS_LICENSE_KEY');
            expect(build).not.toContain('MERCHBASE_GITHUB_NPM_TOKEN');
            expect(serviceBlock).not.toContain('\n    secrets:');
        }

        expect(getServiceBlock('worker', 'caddy')).not.toContain('build:');
    });
});

const getBuildBlock = (service: string) => {
    const serviceBlock = getServiceBlock(service, service === 'server' ? 'worker' : 'volumes');
    const imageIndex = serviceBlock.indexOf('\n    image:');
    if (imageIndex < 0) {
        throw new Error(`Could not isolate ${service} build block in compose.yml.`);
    }
    return serviceBlock.slice(0, imageIndex);
};

const getServiceBlock = (service: string, nextService: string) => {
    const start = compose.indexOf(`  ${service}:\n`);
    const end = compose.indexOf(nextService === 'volumes' ? `\n${nextService}:\n` : `\n  ${nextService}:\n`, start);
    if (start < 0 || end < 0) {
        throw new Error(`Could not isolate ${service} service in compose.yml.`);
    }
    return compose.slice(start, end);
};

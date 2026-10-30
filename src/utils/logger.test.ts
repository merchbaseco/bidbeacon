import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContextLogger } from './logger';

describe('authentication log redaction', () => {
    afterEach(() => vi.restoreAllMocks());
    it('redacts native and cookie secrets in either argument order and child context', () => {
        const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const headers = {
            Authorization: 'bearer-private',
            Cookie: 'cookie-private',
            'Set-Cookie': 'set-cookie-private',
            'CF-Access-Client-Secret': 'native-private',
            'CF-Access-Jwt-Assertion': 'assertion-private',
        };
        const logger = createContextLogger(headers);
        logger.info({ headers }, 'native request');
        logger.info('native request', { headers });
        logger.info({ headers });
        const written = JSON.stringify(output.mock.calls);
        for (const value of Object.values(headers)) {
            expect(written).not.toContain(value);
        }
        expect(written).toContain('[REDACTED]');
    });
});

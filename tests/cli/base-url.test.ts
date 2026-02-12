import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl, withTransportHint } from '../../packages/bidbeacon-cli/src/base-url';

describe('bb base-url normalization', () => {
    it('strips trailing slashes', () => {
        expect(normalizeApiBaseUrl('https://api.bidbeacon.com///')).toBe('https://api.bidbeacon.com');
    });

    it('strips a trailing /api segment', () => {
        expect(normalizeApiBaseUrl('https://api.bidbeacon.com/api')).toBe('https://api.bidbeacon.com');
        expect(normalizeApiBaseUrl('https://api.bidbeacon.com/api/')).toBe('https://api.bidbeacon.com');
    });

    it('preserves non-api path suffixes', () => {
        expect(normalizeApiBaseUrl('https://api.bidbeacon.com/proxy')).toBe('https://api.bidbeacon.com/proxy');
    });
});

describe('bb transport error hint', () => {
    it('adds base-url guidance for transform failures', () => {
        const message = withTransportHint('Unable to transform response from server');
        expect(message).toContain('Unable to transform response from server');
        expect(message).toContain('bb config set base-url');
        expect(message).toContain('/api');
    });

    it('leaves unrelated errors unchanged', () => {
        expect(withTransportHint('Campaign not found.')).toBe('Campaign not found.');
    });
});

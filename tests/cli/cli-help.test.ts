import { describe, expect, it } from 'vitest';
import { renderHelp, resolveHelpTopicKey } from '../../packages/bidbeacon-cli/src/help';

describe('bb help topics', () => {
    it('resolves only canonical topics', () => {
        expect(resolveHelpTopicKey([])).toBe('global');
        expect(resolveHelpTopicKey(['advertiser-accounts', 'list'])).toBe('advertiser-accounts');
        expect(resolveHelpTopicKey(['search'])).toBe('search');
        expect(resolveHelpTopicKey(['performance'])).toBe('performance');
        expect(resolveHelpTopicKey(['create'])).toBe('create');
        expect(resolveHelpTopicKey(['update'])).toBe('update');
        expect(resolveHelpTopicKey(['auth'])).toBe('auth');
        expect(resolveHelpTopicKey(['config'])).toBe('config');
        expect(resolveHelpTopicKey(['changelog'])).toBe('changelog');
        expect(resolveHelpTopicKey(['campaigns'])).toBe('global');
    });

    it('renders canonical operation guidance without legacy names', () => {
        const output = renderHelp('global', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(output).toContain('BidBeacon CLI 0.0.0-abc123');
        expect(output).toContain('advertiser-accounts list');
        expect(output).toContain('search <resource>');
        expect(output).toContain('performance');
        expect(output).toContain('create <operation>');
        expect(output).toContain('requires `--account <');
        expect(output).not.toContain('campaigns');
        expect(output).not.toContain('metrics');
        expect(output).not.toContain('asins');
        expect(output).not.toContain('history');
    });

    it('documents JSON input and the curated search controls', () => {
        const createOutput = renderHelp('create', { version: '0.0.0' });
        expect(createOutput).toContain('sponsored-products-campaign');
        expect(createOutput).toContain('--json <object|@file|->');

        const searchOutput = renderHelp('search', { version: '0.0.0' });
        expect(searchOutput).toContain('--where <expression>');
        expect(searchOutput).toContain('metrics.orders');
        expect(searchOutput).toContain('--all');

        const performanceOutput = renderHelp('performance', { version: '0.0.0' });
        expect(performanceOutput).toContain('--dimension <value>');
        expect(performanceOutput).toContain('--entity-ids <asin,...>');
    });

    it('renders auth, config, and changelog guidance', () => {
        const authOutput = renderHelp('auth', { version: '0.0.0' });
        expect(authOutput).toContain('MERCHBASE_API_KEY');
        const configOutput = renderHelp('config', { version: '0.0.0' });
        expect(configOutput).toContain('base-url|storage-dir');
        expect(configOutput).not.toContain('accountId');
        expect(configOutput).not.toContain('countryCode');
        const changelogOutput = renderHelp('changelog', { version: '0.0.0' });
        expect(changelogOutput).toContain('bb changelog [version] [--all]');
    });
});

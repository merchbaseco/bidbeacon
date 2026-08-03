import { describe, expect, it } from 'vitest';
import { renderHelp, resolveHelpTopicKey } from '../../packages/bidbeacon-cli/src/help';

describe('bb help topics', () => {
    it('resolves nested metrics topics', () => {
        expect(resolveHelpTopicKey(['metrics'])).toBe('metrics');
        expect(resolveHelpTopicKey(['metrics', 'series'])).toBe('metrics series');
        expect(resolveHelpTopicKey(['metrics', 'table'])).toBe('metrics table');
        expect(resolveHelpTopicKey(['changelog'])).toBe('changelog');
        expect(resolveHelpTopicKey(['metrics', 'series', 'campaigns'])).toBe('metrics series');
        expect(resolveHelpTopicKey(['campaign'])).toBe('campaigns');
        expect(resolveHelpTopicKey(['asins'])).toBe('asins');
        expect(resolveHelpTopicKey(['history'])).toBe('history');
    });

    it('renders ASCII help output with usage and commands', () => {
        const output = renderHelp('campaigns', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(output).toContain('BidBeacon 0.0.0-abc123 - config: api-key missing');
        expect(output).toContain('Usage: bb campaigns');
        expect(output).toContain('Commands:');
        expect(output).not.toContain('—');
    });

    it('renders auth and config setup commands', () => {
        const authOutput = renderHelp('auth', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(authOutput).toContain('set [ak_...]');
        expect(authOutput).toContain('set --stdin');
        expect(authOutput).toContain('MERCHBASE_API_KEY');

        const configOutput = renderHelp('config', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(configOutput).toContain('get <key>');
        expect(configOutput).toContain('unset <key>');
        expect(configOutput).toContain('reset');
        expect(configOutput).not.toContain('config clear');
    });

    it('renders explicit history command guidance for targets', () => {
        const targetsOutput = renderHelp('targets', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(targetsOutput).toContain('Use `bb history targets <target_id>` for change-history rows.');

        const historyOutput = renderHelp('history', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(historyOutput).toContain('--range <range>');
    });

    it('renders ASIN and metrics discoverability flags', () => {
        const asinsOutput = renderHelp('asins', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(asinsOutput).toContain('--range <range>');
        expect(asinsOutput).toContain('--metrics <keys>');
        expect(asinsOutput).toContain('--depth <value>');
        expect(asinsOutput).toContain('--state <value>');
        expect(asinsOutput).toContain('tree <asin>');
        expect(asinsOutput).toContain('overview <asin>');

        const metricsSeriesOutput = renderHelp('metrics series', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(metricsSeriesOutput).toContain('--group-by <entity>');
        expect(metricsSeriesOutput).toContain('--asin <ASIN>');
    });

    it('renders changelog command guidance', () => {
        const output = renderHelp('changelog', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(output).toContain('Usage: bb changelog [version] [--all]');
        expect(output).toContain('--all');
        expect(output).toContain('Version arg accepts `1.2.3` or `v1.2.3`.');
    });
});

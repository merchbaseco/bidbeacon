import { describe, expect, it } from 'vitest';
import { renderHelp, resolveHelpTopicKey } from '../../packages/bidbeacon-cli/src/help';

describe('bb help topics', () => {
    it('resolves nested metrics topics', () => {
        expect(resolveHelpTopicKey(['metrics'])).toBe('metrics');
        expect(resolveHelpTopicKey(['metrics', 'series'])).toBe('metrics series');
        expect(resolveHelpTopicKey(['metrics', 'table'])).toBe('metrics table');
        expect(resolveHelpTopicKey(['metrics', 'series', 'campaigns'])).toBe('metrics series');
    });

    it('renders ASCII help output with usage and commands', () => {
        const output = renderHelp('campaigns', { version: '0.0.0', sha: 'abc123', configSummary: 'config: api-key missing' });
        expect(output).toContain('BidBeacon 0.0.0-abc123 - config: api-key missing');
        expect(output).toContain('Usage: bb campaigns');
        expect(output).toContain('Commands:');
        expect(output).not.toContain('—');
    });
});


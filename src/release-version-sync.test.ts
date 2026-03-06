import { describe, expect, it } from 'vitest';
import { assertReleaseVersionSync } from './lib/release-version-sync';

describe('release version sync', () => {
    it('keeps package versions and bun.lock aligned for the published client surface', async () => {
        await expect(assertReleaseVersionSync()).resolves.toBeUndefined();
    });
});

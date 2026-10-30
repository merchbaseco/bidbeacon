import { describe, expect, it, vi } from 'vitest';
import { resolveBidBeaconPrincipal } from './bidbeacon-access';

vi.mock('@/db/index', () => ({ db: {} }));
describe('BidBeacon memberships', () => {
    it('resolves stable-user many-to-many memberships without duplicate accounts', async () => {
        const where = vi.fn().mockResolvedValue([
            { advertiserAccountId: '00000000-0000-4000-8000-000000000001', adsAccountId: 'shared-amazon-account' },
            { advertiserAccountId: '00000000-0000-4000-8000-000000000001', adsAccountId: 'shared-amazon-account' },
            { advertiserAccountId: '00000000-0000-4000-8000-000000000002', adsAccountId: 'shared-amazon-account' },
        ]);
        const database = {
            select: vi.fn(() => ({
                from: vi.fn(() => ({ where })),
            })),
        };

        await expect(resolveBidBeaconPrincipal(database as never, 'mbu_one')).resolves.toEqual({
            accessibleAccountIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
            legacyAdsAccountIds: ['shared-amazon-account'],
            merchbaseUserId: 'mbu_one',
        });
        await expect(resolveBidBeaconPrincipal(database as never, 'user_one')).rejects.toMatchObject({ code: 'access_unavailable' });
    });
});

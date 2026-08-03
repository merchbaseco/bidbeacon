import { ServiceAccessError } from '@merchbaseco/access';
import { describe, expect, it, vi } from 'vitest';
import { evaluateAccountAccess } from './account-access-gate';

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/services/access/bidbeacon-access', () => ({ getBidBeaconAccess: vi.fn() }));

describe('account access gate', () => {
    it('skips accounts with no current members', async () => {
        await expect(evaluateAccountAccess({ evaluateAccess: vi.fn(), memberships: [] })).resolves.toEqual({
            allowed: false,
            reason: 'no_current_members',
        });
    });

    it('allows an account when any current member is granted', async () => {
        const evaluateAccess = vi.fn().mockRejectedValueOnce(new ServiceAccessError('access_denied')).mockResolvedValueOnce({ merchbaseUserId: 'mbu_two' });

        await expect(
            evaluateAccountAccess({
                evaluateAccess,
                memberships: [{ merchbaseUserId: 'mbu_one' }, { merchbaseUserId: 'mbu_two' }],
            })
        ).resolves.toEqual({ allowed: true, reason: 'allowed' });
        expect(evaluateAccess).toHaveBeenCalledTimes(2);
    });

    it('denies only when every member is denied, and distinguishes unavailable access', async () => {
        await expect(
            evaluateAccountAccess({
                evaluateAccess: vi.fn().mockRejectedValue(new ServiceAccessError('access_denied')),
                memberships: [{ merchbaseUserId: 'mbu_one' }],
            })
        ).resolves.toEqual({ allowed: false, reason: 'access_denied' });

        await expect(
            evaluateAccountAccess({
                evaluateAccess: vi.fn().mockRejectedValue(new ServiceAccessError('access_unavailable')),
                memberships: [{ merchbaseUserId: 'mbu_one' }],
            })
        ).resolves.toEqual({ allowed: false, reason: 'access_unavailable' });
    });
});

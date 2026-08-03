import { ServiceAccessError } from '@merchbaseco/access';
import { describe, expect, it, vi } from 'vitest';
import { refreshActiveAccessProjections } from './refresh-access-projections';

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/services/access/bidbeacon-access', () => ({ getBidBeaconAccess: vi.fn() }));

describe('access projection refresh', () => {
    it('refreshes every active stable user and continues after one failure', async () => {
        const refreshAccess = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new ServiceAccessError('access_unavailable')).mockResolvedValueOnce({});
        const failures: string[] = [];

        const results = await refreshActiveAccessProjections({
            merchbaseUserIds: ['mbu_one', 'mbu_two', 'mbu_three'],
            onFailure: merchbaseUserId => failures.push(merchbaseUserId),
            refreshAccess,
        });

        expect(refreshAccess).toHaveBeenCalledWith('mbu_one');
        expect(refreshAccess).toHaveBeenCalledWith('mbu_two');
        expect(refreshAccess).toHaveBeenCalledWith('mbu_three');
        expect(failures).toEqual(['mbu_two']);
        expect(results.map(result => result.refreshed)).toEqual([true, false, true]);
    });
});

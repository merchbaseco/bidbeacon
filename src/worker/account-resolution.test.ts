import { describe, expect, it, vi } from 'vitest';
import { type AmsAccountLookup, AmsAccountResolutionError, resolveAmsAccountIds } from './account-resolution';

const createLookup = (overrides: Partial<AmsAccountLookup> = {}): AmsAccountLookup => ({
    findByAdGroupId: vi.fn().mockResolvedValue(['account-from-ad-group']),
    findByAdvertiserId: vi.fn().mockResolvedValue(['account-from-advertiser']),
    findByCampaignId: vi.fn().mockResolvedValue(['account-from-campaign']),
    ...overrides,
});

describe('AMS account resolution', () => {
    it('maps direct advertiser payloads through advertiser identity and deduplicates message batches', async () => {
        const lookup = createLookup();
        const payload = [
            { advertiser_id: 'entity-1', dataset_id: 'sp-traffic-2026', marketplace_id: 'marketplace-1' },
            { advertiser_id: 'entity-1', dataset_id: 'sp-conversion-2026', marketplace_id: 'marketplace-1' },
        ];

        await expect(resolveAmsAccountIds(payload, lookup)).resolves.toEqual(['account-from-advertiser']);
        expect(lookup.findByAdvertiserId).toHaveBeenCalledTimes(2);
        expect(lookup.findByCampaignId).not.toHaveBeenCalled();
    });

    it('maps campaign-management payloads through existing canonical account ownership', async () => {
        const lookup = createLookup();

        await expect(resolveAmsAccountIds({ campaign_id: 'campaign-1', dataset_id: 'ads-campaign-management-campaigns-2026' }, lookup)).resolves.toEqual(['account-from-campaign']);
        await expect(resolveAmsAccountIds({ ad_group_id: 'ad-group-1', dataset_id: 'ads-campaign-management-ads-2026' }, lookup)).resolves.toEqual(['account-from-ad-group']);
        await expect(resolveAmsAccountIds({ ad_group_id: 'ad-group-1', campaign_id: 'campaign-1', dataset_id: 'ads-campaign-management-ads-2026' }, lookup)).rejects.toMatchObject({
            reason: 'ambiguous_account',
        });
        expect(lookup.findByCampaignId).toHaveBeenCalledWith('campaign-1');
        expect(lookup.findByAdGroupId).toHaveBeenCalledWith('ad-group-1');
    });

    it('fails closed for unknown, ambiguous, incomplete, and unavailable account mappings', async () => {
        await expect(resolveAmsAccountIds({ dataset_id: 'unknown-dataset' }, createLookup())).rejects.toMatchObject({ reason: 'unknown_account' });
        await expect(
            resolveAmsAccountIds(
                { advertiser_id: 'entity-1', dataset_id: 'sp-traffic-2026', marketplace_id: 'marketplace-1' },
                createLookup({ findByAdvertiserId: vi.fn().mockResolvedValue(['account-1', 'account-2']) })
            )
        ).rejects.toMatchObject({ reason: 'ambiguous_account' });
        await expect(resolveAmsAccountIds({ advertiser_id: 'entity-1', dataset_id: 'sp-traffic-2026' }, createLookup())).rejects.toMatchObject({ reason: 'unknown_account' });
        await expect(
            resolveAmsAccountIds(
                { advertiser_id: 'entity-1', dataset_id: 'sp-traffic-2026', marketplace_id: 'marketplace-1' },
                createLookup({ findByAdvertiserId: vi.fn().mockRejectedValue(new Error('database unavailable')) })
            )
        ).rejects.toMatchObject({ reason: 'access_unavailable' });
        await expect(
            resolveAmsAccountIds(
                { ad_group_id: 'missing-ad-group', campaign_id: 'campaign-1', dataset_id: 'ads-campaign-management-ads-2026' },
                createLookup({ findByAdGroupId: vi.fn().mockResolvedValue([]) })
            )
        ).rejects.toMatchObject({ reason: 'unknown_account' });
        expect(new AmsAccountResolutionError('unknown_account')).toBeInstanceOf(Error);
    });
});

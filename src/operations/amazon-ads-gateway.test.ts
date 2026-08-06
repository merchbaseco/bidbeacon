import { describe, expect, it } from 'vitest';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';

describe('createFakeAmazonAdsGateway', () => {
    it('records requests and returns representative accepted responses without validating input', async () => {
        const gateway = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: { success: [{ campaignId: 'campaign-custom' }] },
            },
        });
        const input = { profileId: 123, campaigns: [{ malformedForAmazonOnPurpose: true }] };

        await expect(gateway.createCampaigns(input)).resolves.toEqual({ success: [{ campaignId: 'campaign-custom' }] });
        expect(gateway.calls).toEqual([{ operation: 'createCampaigns', input }]);
    });

    it('fails at the configured operation call', async () => {
        const gateway = createFakeAmazonAdsGateway({
            failure: {
                operation: 'updateTargets',
                callNumber: 2,
                message: 'target update rejected',
            },
        });

        await expect(gateway.updateTargets({ profileId: 123, targets: [{ targetId: 'target-1' }] })).resolves.toEqual({ success: [{ targetId: 'target-1' }] });
        await expect(gateway.updateTargets({ profileId: 123, targets: [{ targetId: 'target-2' }] })).rejects.toThrow('target update rejected');
        expect(gateway.calls.map(call => call.operation)).toEqual(['updateTargets', 'updateTargets']);
    });
});

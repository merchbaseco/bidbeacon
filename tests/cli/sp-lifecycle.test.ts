import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCliConfig, createTestCaller, loadEnv } from '../utils/cli-test-harness';

const requireEnv = (key: string) => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env var: ${key}. Set it in .env or export it before running tests.`);
    }
    return value;
};

loadEnv();

const testAccountId = requireEnv('ADS_API_TEST_ACCOUNT_ID');
const testAsin = requireEnv('ADS_API_TEST_ASIN');
const describeIntegration = describe;

describeIntegration('cli sp lifecycle', () => {
    let caller: Awaited<ReturnType<typeof createTestCaller>> | null = null;
    let config: ReturnType<typeof createCliConfig> | null = null;
    let campaignId: string | null = null;
    let adGroupId: string | null = null;
    let adId: string | null = null;
    let targetId: string | null = null;

    beforeAll(async () => {
        const accountId = testAccountId as string;
        caller = await createTestCaller(accountId);
        config = createCliConfig(accountId);

        const campaignName = `bb-cli-${Date.now()}-campaign`;
        const campaign = await caller['campaigns/create']({
            config,
            name: campaignName,
            budget: 10,
        });
        campaignId = campaign.item.campaignId;

        const adGroupName = `bb-cli-${Date.now()}-ad-group`;
        const adGroup = await caller['ad-groups/create']({
            config,
            campaignId,
            name: adGroupName,
            defaultBid: 0.5,
        });
        adGroupId = adGroup.item.adGroupId;

        const ad = await caller['ads/create']({
            config,
            adGroupId,
            productIdType: 'ASIN',
            productId: testAsin,
        });
        adId = ad.item.adId;

        const target = await caller['targets/create/keyword']({
            config,
            adGroupId,
            keyword: `bb-cli-${Date.now()}-kw`,
            matchType: 'BROAD',
            bid: 0.75,
        });
        targetId = target.item.targetId;
    });

    afterAll(async () => {
        if (!(caller && config)) {
            return;
        }
        const errors: string[] = [];

        const attempt = async (label: string, fn: () => Promise<void>) => {
            try {
                await fn();
            } catch (error) {
                errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
            }
        };

        if (targetId) {
            await attempt('delete target', async () => {
                await caller!['targets/delete']({ config: config!, targetId: targetId! });
            });
        }

        if (adId) {
            await attempt('delete ad', async () => {
                await caller!['ads/delete']({ config: config!, adId: adId! });
            });
        }

        if (adGroupId) {
            await attempt('delete ad group', async () => {
                await caller!['ad-groups/delete']({ config: config!, adGroupId: adGroupId! });
            });
        }

        if (campaignId) {
            await attempt('delete campaign', async () => {
                await caller!['campaigns/delete']({ config: config!, campaignId: campaignId! });
            });
        }

        if (errors.length > 0) {
            throw new Error(`CLI cleanup failed:\n${errors.join('\n')}`);
        }
    });

    it('runs a full lifecycle without excessive entity creation', async () => {
        if (!(caller && config && campaignId && adGroupId && adId && targetId)) {
            throw new Error('Missing fixture entities for lifecycle test.');
        }

        // This test validates Amazon Ads API-backed mutations, not BidBeacon DB reads.
        const pausedCampaign = await caller['campaigns/pause']({ config, campaignId });
        expect(pausedCampaign.item.state).toBe('PAUSED');

        const resumedCampaign = await caller['campaigns/resume']({ config, campaignId });
        expect(resumedCampaign.item.state).toBe('ENABLED');

        const pausedAdGroup = await caller['ad-groups/pause']({ config, adGroupId });
        expect(pausedAdGroup.item.state).toBe('PAUSED');

        const resumedAdGroup = await caller['ad-groups/resume']({ config, adGroupId });
        expect(resumedAdGroup.item.state).toBe('ENABLED');

        const pausedTarget = await caller['targets/pause']({ config, targetId });
        expect(pausedTarget.item.state).toBe('PAUSED');

        const resumedTarget = await caller['targets/resume']({ config, targetId });
        expect(resumedTarget.item.state).toBe('ENABLED');

        const setBid = await caller['bids/set']({ config, targetId, value: 0.8 });
        expect(setBid.item.bid).toBe(0.8);

        const updatedAd = await caller['ads/update']({ config, adId, state: 'PAUSED' });
        expect(updatedAd.item.state).toBe('PAUSED');

        const resumedAd = await caller['ads/update']({ config, adId, state: 'ENABLED' });
        expect(resumedAd.item.state).toBe('ENABLED');

        await caller['targets/delete']({ config, targetId });
        targetId = null;

        await caller['ads/delete']({ config, adId });
        adId = null;

        await caller['ad-groups/delete']({ config, adGroupId });
        adGroupId = null;

        await caller['campaigns/delete']({ config, campaignId });
        campaignId = null;
    }, 30_000);
});

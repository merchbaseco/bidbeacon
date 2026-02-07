import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createCliConfig,
    createTestCaller,
    getTestAccountId,
    loadEnv,
} from '../utils/cli-test-harness';

loadEnv();

const testAccountId = getTestAccountId();
const testAsin = process.env.ADS_API_TEST_ASIN ?? null;
const describeIntegration = testAccountId && testAsin ? describe : describe.skip;

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
        const campaign = await caller.api.cli.campaignsCreate({
            config,
            name: campaignName,
            budget: 10,
        });
        campaignId = campaign.item.campaignId;

        const adGroupName = `bb-cli-${Date.now()}-ad-group`;
        const adGroup = await caller.api.cli.adGroupsCreate({
            config,
            campaignId,
            name: adGroupName,
            defaultBid: 0.5,
        });
        adGroupId = adGroup.item.adGroupId;

        const ad = await caller.api.cli.adsCreate({
            config,
            adGroupId,
            productIdType: 'ASIN',
            productId: testAsin,
        });
        adId = ad.item.adId;

        const target = await caller.api.cli.targetsCreateKeyword({
            config,
            adGroupId,
            keyword: `bb-cli-${Date.now()}-kw`,
            matchType: 'BROAD',
            bid: 0.75,
        });
        targetId = target.item.targetId;
    });

    afterAll(async () => {
        if (!caller || !config) return;
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
                await caller!.api.cli.targetsDelete({ config: config!, targetId: targetId! });
            });
        }

        if (adId) {
            await attempt('delete ad', async () => {
                await caller!.api.cli.adsDelete({ config: config!, adId: adId! });
            });
        }

        if (adGroupId) {
            await attempt('delete ad group', async () => {
                await caller!.api.cli.adGroupsDelete({ config: config!, adGroupId: adGroupId! });
            });
        }

        if (campaignId) {
            await attempt('delete campaign', async () => {
                await caller!.api.cli.campaignsDelete({ config: config!, campaignId: campaignId! });
            });
        }

        if (errors.length > 0) {
            throw new Error(`CLI cleanup failed:\n${errors.join('\n')}`);
        }
    });

    it('runs a full lifecycle without excessive entity creation', async () => {
        if (!caller || !config || !campaignId || !adGroupId || !adId || !targetId) {
            throw new Error('Missing fixture entities for lifecycle test.');
        }

        // This test validates Amazon Ads API-backed mutations, not BidBeacon DB reads.
        const pausedCampaign = await caller.api.cli.campaignsPause({ config, campaignId });
        expect(pausedCampaign.item.state).toBe('PAUSED');

        const resumedCampaign = await caller.api.cli.campaignsResume({ config, campaignId });
        expect(resumedCampaign.item.state).toBe('ENABLED');

        const pausedAdGroup = await caller.api.cli.adGroupsPause({ config, adGroupId });
        expect(pausedAdGroup.item.state).toBe('PAUSED');

        const resumedAdGroup = await caller.api.cli.adGroupsResume({ config, adGroupId });
        expect(resumedAdGroup.item.state).toBe('ENABLED');

        const pausedTarget = await caller.api.cli.targetsPause({ config, targetId });
        expect(pausedTarget.item.state).toBe('PAUSED');

        const resumedTarget = await caller.api.cli.targetsResume({ config, targetId });
        expect(resumedTarget.item.state).toBe('ENABLED');

        const setBid = await caller.api.cli.bidsSet({ config, targetId, value: 0.8 });
        expect(setBid.item.bid).toBe(0.8);

        const updatedAd = await caller.api.cli.adsUpdate({ config, adId, state: 'PAUSED' });
        expect(updatedAd.item.state).toBe('PAUSED');

        const resumedAd = await caller.api.cli.adsUpdate({ config, adId, state: 'ENABLED' });
        expect(resumedAd.item.state).toBe('ENABLED');

        await caller.api.cli.targetsDelete({ config, targetId });
        targetId = null;

        await caller.api.cli.adsDelete({ config, adId });
        adId = null;

        await caller.api.cli.adGroupsDelete({ config, adGroupId });
        adGroupId = null;

        await caller.api.cli.campaignsDelete({ config, campaignId });
        campaignId = null;
    }, 30000);
});

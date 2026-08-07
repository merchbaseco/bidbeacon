import { describe, expect, it } from 'vitest';
import { createBidBeaconClient, type RouterOutputs } from '../../packages/bidbeacon-api-client/src';

const liveSmokeEnabled = process.env.RUN_LIVE_SMOKE === 'true';
const describeLive = liveSmokeEnabled ? describe : describe.skip;

describeLive('Sponsored Products live smoke', () => {
    it('creates, updates, and archives one paused canonical Sponsored Products topology', async () => {
        const accountId = requireLiveEnv('BIDBEACON_LIVE_ACCOUNT_ID');
        const asin = requireLiveEnv('BIDBEACON_LIVE_ASIN');
        const apiKey = requireLiveEnv('MERCHBASE_API_KEY');
        const baseUrl = process.env.BB_BASE_URL ?? 'https://bidbeacon.merchbase.co';
        const client = createBidBeaconClient({ baseUrl, credential: apiKey, batch: false });
        let created: RouterOutputs['create_sponsored_products_campaign'] | undefined;
        const cleanupErrors: string[] = [];

        try {
            const suffix = Date.now();
            created = await client.create_sponsored_products_campaign.mutate({
                accountId,
                campaign: {
                    name: `bb-live-smoke-${suffix}`,
                    state: 'PAUSED',
                    dailyBudget: 10,
                    bidStrategy: 'DYNAMIC_DOWN_ONLY',
                },
                adGroup: {
                    name: `bb-live-smoke-${suffix}-default`,
                    defaultBid: 0.5,
                },
                asins: [asin],
                targeting: {
                    mode: 'MANUAL_KEYWORD',
                    keywords: [{ keyword: `bb live smoke ${suffix}`, matchType: 'EXACT', bid: 0.75 }],
                },
            });

            expect(created.campaign.state).toBe('PAUSED');
            expect(created.ads).toHaveLength(1);
            expect(created.targets).toHaveLength(1);

            const target = created.targets[0];
            const updatedTarget = await client.update_target.mutate({
                accountId,
                targetId: target.id,
                changes: { bid: 0.8, state: 'PAUSED' },
            });
            expect(updatedTarget).toMatchObject({ id: target.id, bid: 0.8, state: 'PAUSED' });

            const updatedAdGroup = await client.update_ad_group.mutate({
                accountId,
                adGroupId: created.adGroup.id,
                changes: { defaultBid: 0.55 },
            });
            expect(updatedAdGroup.defaultBid).toBe(0.55);
        } finally {
            if (created) {
                for (const target of created.targets) {
                    await attemptCleanup(cleanupErrors, `target ${target.id}`, () => client.update_target.mutate({ accountId, targetId: target.id, changes: { state: 'ARCHIVED' } }));
                }
                for (const ad of created.ads) {
                    await attemptCleanup(cleanupErrors, `ad ${ad.id}`, () => client.update_ad.mutate({ accountId, adId: ad.id, changes: { state: 'ARCHIVED' } }));
                }
                await attemptCleanup(cleanupErrors, `ad group ${created.adGroup.id}`, () =>
                    client.update_ad_group.mutate({ accountId, adGroupId: created!.adGroup.id, changes: { state: 'ARCHIVED' } })
                );
                await attemptCleanup(cleanupErrors, `campaign ${created.campaign.id}`, () =>
                    client.update_campaign.mutate({ accountId, campaignId: created!.campaign.id, changes: { state: 'ARCHIVED' } })
                );
            }
        }

        if (cleanupErrors.length > 0) {
            throw new Error(`Live smoke cleanup failed:\n${cleanupErrors.join('\n')}`);
        }
    }, 120_000);
});

const requireLiveEnv = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`RUN_LIVE_SMOKE=true requires ${name}.`);
    }
    return value;
};

const attemptCleanup = async (errors: string[], label: string, cleanup: () => Promise<unknown>) => {
    try {
        await cleanup();
    } catch (error) {
        errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
};

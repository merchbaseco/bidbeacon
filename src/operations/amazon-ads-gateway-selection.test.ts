import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAmazonAdsGateway } from './amazon-ads-gateway-selection';
import { createLocalAmazonAdsGateway, INELIGIBLE_ASIN, INELIGIBLE_CODE } from './local-amazon-ads-gateway';
import { productionAmazonAdsGateway } from './production-amazon-ads-gateway';

describe('Amazon Ads gateway selection', () => {
    it('keeps the live gateway when the selector is unset', () => {
        expect(resolveAmazonAdsGateway({})).toBe(productionAmazonAdsGateway);
        expect(resolveAmazonAdsGateway({ BIDBEACON_AMAZON_ADS_GATEWAY: 'amazon' })).toBe(productionAmazonAdsGateway);
    });

    it('refuses the fake when NODE_ENV is production', () => {
        expect(() => resolveAmazonAdsGateway({ BIDBEACON_AMAZON_ADS_GATEWAY: 'fake', NODE_ENV: 'production' })).toThrow('cannot be selected');
    });

    it('refuses the fake when VARLOCK_ENV is production even if NODE_ENV is development', () => {
        expect(() => resolveAmazonAdsGateway({ BIDBEACON_AMAZON_ADS_GATEWAY: 'fake', NODE_ENV: 'development', VARLOCK_ENV: 'production' })).toThrow('cannot be selected');
    });

    it('refuses any selector other than amazon or fake', () => {
        expect(() => resolveAmazonAdsGateway({ BIDBEACON_AMAZON_ADS_GATEWAY: 'fixture' })).toThrow('amazon or fake');
    });

    it('returns a recording double outside production', () => {
        const gateway = resolveAmazonAdsGateway({ BIDBEACON_AMAZON_ADS_GATEWAY: 'fake', NODE_ENV: 'development', VARLOCK_ENV: 'development' });
        expect(gateway).not.toBe(productionAmazonAdsGateway);
        expect(gateway.updateCampaigns).not.toBe(productionAmazonAdsGateway.updateCampaigns);
    });
});

describe('local Amazon Ads gateway', () => {
    it('echoes an update and records the call', async () => {
        const gateway = createLocalAmazonAdsGateway();
        const result = await gateway.updateCampaigns({ campaigns: [{ campaignId: 'campaign-7', state: 'PAUSED' }], profileId: 1 });

        expect(result).toEqual({ success: [{ campaign: { campaignId: 'campaign-7', state: 'PAUSED' } }] });
        expect(gateway.calls).toEqual([{ operation: 'updateCampaigns', input: { campaigns: [{ campaignId: 'campaign-7', state: 'PAUSED' }], profileId: 1 } }]);
    });

    it('returns a per-index PRODUCT_INELIGIBLE rejection', async () => {
        const gateway = createLocalAmazonAdsGateway();
        const result = await gateway.createTargets({
            profileId: 1,
            targets: [
                { asin: INELIGIBLE_ASIN, state: 'ENABLED' },
                { asin: 'B0DEV5EED01', state: 'ENABLED' },
            ],
        });

        expect(result.error).toEqual([
            {
                index: 0,
                errors: [{ code: INELIGIBLE_CODE, message: 'Product is ineligible for advertising.' }],
            },
        ]);
        expect(result.success).toBeUndefined();
    });

    it('appends the recorded call when a log path is set', async () => {
        const logPath = join(mkdtempSync(join(tmpdir(), 'amazon-ads-')), 'calls.jsonl');
        const gateway = createLocalAmazonAdsGateway({ logPath });
        await gateway.deleteCampaigns({ campaigns: [{ campaignId: 'campaign-7' }], profileId: 1 });

        expect(JSON.parse(readFileSync(logPath, 'utf8'))).toMatchObject({ operation: 'deleteCampaigns' });
    });
});

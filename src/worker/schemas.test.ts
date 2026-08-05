import { describe, expect, it } from 'vitest';
import { adSchema } from './schemas';

describe('adSchema', () => {
    it('accepts an unavailable delivery status from Amazon Marketing Stream', () => {
        const result = adSchema.safeParse({
            advertiser_id: 'ENTITY298S6CJCWDP2M',
            marketplace_id: 'ATVPDKIKX0DER',
            dataset_id: 'ads-campaign-management-ads',
            last_updated_date_time: '2026-08-04T16:46Z',
            ad_type: 'PRODUCT_AD',
            marketplaces: ['US'],
            creation_date_time: '2021-11-03T02:05Z',
            ad_id: '94214830420455',
            marketplace_scope: 'SINGLE_MARKETPLACE',
            state: 'ENABLED',
            ad_group_id: '120279831998809',
            campaign_id: '78903088318248',
            ad_product: 'SPONSORED_PRODUCTS',
            status: {
                marketplace_settings: [],
                delivery_reasons: ['OTHER'],
                delivery_status: null,
            },
        });

        expect(result.success).toBe(true);
    });
});

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({
    db: {},
}));

let mapTargetFromApi: (targetData: Record<string, unknown>) => {
    type: string;
    targetMatchType?: string | null;
    keyword?: string | null;
    keywordMatchType?: string | null;
    productId?: string | null;
    productMatchType?: string | null;
};
let mapAdFromApi: (adData: Record<string, unknown>) => {
    productIdType: string;
    productId: string;
    productTitle: string | null;
};

beforeAll(async () => {
    ({ mapAdFromApi, mapTargetFromApi } = await import('@/api/public/shared'));
});

describe('mapTargetFromApi', () => {
    it('maps AUTO targets with direct match type', () => {
        const mapped = mapTargetFromApi({
            targetId: '123',
            campaignId: '456',
            adGroupId: '789',
            state: 'ENABLED',
            targetType: 'AUTO',
            targetDetails: {
                matchType: 'SEARCH_CLOSE_MATCH',
            },
        });

        expect(mapped.type).toBe('AUTO');
        expect(mapped.targetMatchType).toBe('SEARCH_CLOSE_MATCH');
        expect(mapped.keyword).toBeNull();
        expect(mapped.productId).toBeNull();
    });

    it('normalizes AUTO expression match types from targeting expressions', () => {
        const mapped = mapTargetFromApi({
            targetId: '123',
            campaignId: '456',
            state: 'ENABLED',
            targetType: 'AUTO',
            expressionType: 'AUTO',
            resolvedExpression: [
                {
                    type: 'QUERY_HIGH_REL_MATCHES',
                },
            ],
        });

        expect(mapped.type).toBe('AUTO');
        expect(mapped.targetMatchType).toBe('SEARCH_CLOSE_MATCH');
    });

    it('keeps KEYWORD targets as KEYWORD', () => {
        const mapped = mapTargetFromApi({
            targetId: '123',
            campaignId: '456',
            adGroupId: '789',
            state: 'PAUSED',
            targetType: 'KEYWORD',
            targetDetails: {
                keywordTarget: {
                    keyword: 'running shoes',
                    matchType: 'EXACT',
                },
            },
        });

        expect(mapped.type).toBe('KEYWORD');
        expect(mapped.targetMatchType).toBe('EXACT');
        expect(mapped.keyword).toBe('running shoes');
        expect(mapped.keywordMatchType).toBe('EXACT');
    });

    it('keeps PRODUCT targets as PRODUCT', () => {
        const mapped = mapTargetFromApi({
            targetId: '123',
            campaignId: '456',
            adGroupId: '789',
            state: 'PAUSED',
            targetType: 'PRODUCT',
            targetDetails: {
                productTarget: {
                    productIdType: 'ASIN',
                    matchType: 'PRODUCT_EXACT',
                    product: {
                        productId: 'B000000001',
                    },
                },
            },
        });

        expect(mapped.type).toBe('PRODUCT');
        expect(mapped.targetMatchType).toBe('PRODUCT_EXACT');
        expect(mapped.productId).toBe('B000000001');
        expect(mapped.productMatchType).toBe('PRODUCT_EXACT');
    });
});

describe('mapAdFromApi', () => {
    it('maps advertised product titles when present', () => {
        const mapped = mapAdFromApi({
            adId: 'ad-1',
            campaignId: 'campaign-1',
            adGroupId: 'ad-group-1',
            state: 'ENABLED',
            creative: {
                productCreative: {
                    productCreativeSettings: {
                        advertisedProduct: {
                            productIdType: 'ASIN',
                            productId: 'B000000001',
                            title: '  PopSockets Grip  ',
                        },
                    },
                },
            },
        });

        expect(mapped.productIdType).toBe('ASIN');
        expect(mapped.productId).toBe('B000000001');
        expect(mapped.productTitle).toBe('PopSockets Grip');
    });

    it('returns null titles when advertised product title is missing', () => {
        const mapped = mapAdFromApi({
            adId: 'ad-1',
            campaignId: 'campaign-1',
            adGroupId: 'ad-group-1',
            state: 'ENABLED',
            creative: {
                productCreative: {
                    productCreativeSettings: {
                        advertisedProduct: {
                            productIdType: 'ASIN',
                            productId: 'B000000001',
                        },
                    },
                },
            },
        });

        expect(mapped.productTitle).toBeNull();
    });
});

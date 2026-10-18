import { describe, expect, it } from 'vitest';
import { parsePlacementBidAdjustments, placementFromExportOptimization, placementWrite, readStoredPlacementBidAdjustments, toAmazonPlacementBidAdjustments } from './placement-bid-adjustments';

describe('parsePlacementBidAdjustments', () => {
    it('keeps positive integer percentages from an Amazon placement array', () => {
        expect(
            parsePlacementBidAdjustments([
                { placement: 'TOP_OF_SEARCH', percentage: 165 },
                { placement: 'PRODUCT_PAGE', percentage: 30 },
                { placement: 'REST_OF_SEARCH', percentage: 0 },
                { placement: 'HOME_PAGE', percentage: 15 },
            ])
        ).toEqual({
            present: true,
            value: { topOfSearch: 165, productPages: 30 },
        });
    });

    it('reads a nested Amazon campaign record and drops fractions, out-of-range numbers, and unknown placements', () => {
        expect(
            parsePlacementBidAdjustments({
                campaignId: 'campaign-1',
                optimizations: {
                    bidSettings: {
                        bidAdjustments: {
                            placementBidAdjustments: [
                                { predicate: 'PLACEMENT_TOP', percentage: '165' },
                                { placement: 'PRODUCT_PAGE', percentage: 10.5 },
                                { placement: 'AMAZON_BUSINESS', percentage: 901 },
                                { placement: 'DETAIL_PAGE', percentage: 40 },
                            ],
                        },
                    },
                },
            })
        ).toEqual({
            present: true,
            value: { topOfSearch: 165 },
        });
    });

    it('reads an object-shaped adjustment on an optimization record', () => {
        expect(
            parsePlacementBidAdjustments({
                bidStrategy: 'MANUAL',
                topOfSearch: 165,
                productPages: 30,
                restOfSearch: 0,
            })
        ).toEqual({
            present: true,
            value: { topOfSearch: 165, productPages: 30 },
        });
    });

    it('returns an empty map when the included field has no positive percentage', () => {
        expect(parsePlacementBidAdjustments([])).toEqual({ present: true, value: {} });
        expect(parsePlacementBidAdjustments({ placementBidAdjustments: { topOfSearch: 0, productPages: 1.2 } })).toEqual({ present: true, value: {} });
    });

    it('reports an omitted field when a campaign record has no placement key', () => {
        expect(parsePlacementBidAdjustments({ campaignId: 'campaign-1', optimizations: { bidSettings: { bidStrategy: 'MANUAL' } } })).toEqual({ present: false });
        expect(parsePlacementBidAdjustments(undefined)).toEqual({ present: false });
    });
});

describe('placementFromExportOptimization', () => {
    it('stores the public object from an export placement array', () => {
        expect(
            placementFromExportOptimization({
                bidStrategy: 'MANUAL',
                placementBidAdjustments: [
                    { placement: 'TOP_OF_SEARCH', percentage: 165 },
                    { placement: 'PRODUCT_PAGE', percentage: 30 },
                    { placement: 'REST_OF_SEARCH', percentage: 0 },
                ],
            })
        ).toEqual({ topOfSearch: 165, productPages: 30 });
    });

    it('stores an empty map when the export reports no placement adjustments', () => {
        expect(placementFromExportOptimization({ bidStrategy: 'MANUAL' })).toEqual({});
        expect(placementFromExportOptimization({ bidStrategy: 'MANUAL', placementBidAdjustments: [] })).toEqual({});
        expect(placementFromExportOptimization(undefined)).toEqual({});
    });
});

describe('placementWrite', () => {
    it('replaces with the Amazon value when Amazon included the field', () => {
        expect(
            placementWrite({
                resolution: { present: true, value: { topOfSearch: 165, productPages: 30 } },
                requested: { productPages: 20 },
                stored: { restOfSearch: 10 },
            })
        ).toEqual({ mode: 'replace', value: { topOfSearch: 165, productPages: 30 } });
    });

    it('replaces with an empty map when Amazon included the field and nothing positive remains', () => {
        expect(
            placementWrite({
                resolution: { present: true, value: {} },
                requested: { topOfSearch: 50 },
                stored: { topOfSearch: 50 },
            })
        ).toEqual({ mode: 'replace', value: {} });
    });

    it('replaces with the merged map when Amazon omitted placements and the request changed them', () => {
        expect(
            placementWrite({
                resolution: { present: false },
                requested: { restOfSearch: 0, productPages: 20 },
                stored: { topOfSearch: 165, restOfSearch: 10 },
            })
        ).toEqual({ mode: 'replace', value: { topOfSearch: 165, productPages: 20 } });
    });

    it('preserves the stored map when Amazon omitted placements and the request did not mention them', () => {
        expect(
            placementWrite({
                resolution: { present: false },
                requested: undefined,
                stored: { topOfSearch: 165 },
            })
        ).toEqual({ mode: 'preserve' });
    });

    it('preserves SQL null when Amazon omitted placements and the request did not mention them', () => {
        expect(
            placementWrite({
                resolution: { present: false },
                requested: undefined,
                stored: null,
            })
        ).toEqual({ mode: 'preserve' });
    });

    it('replaces with an empty map when a merge clears the last stored key', () => {
        expect(
            placementWrite({
                resolution: { present: false },
                requested: { topOfSearch: 0 },
                stored: { topOfSearch: 165 },
            })
        ).toEqual({ mode: 'replace', value: {} });
    });
});

describe('readStoredPlacementBidAdjustments', () => {
    it('returns the stored object', () => {
        expect(readStoredPlacementBidAdjustments({ topOfSearch: 165, productPages: 30 })).toEqual({ topOfSearch: 165, productPages: 30 });
    });

    it('returns null for SQL null', () => {
        expect(readStoredPlacementBidAdjustments(null)).toBeNull();
    });

    it('returns an empty map for a stored empty object', () => {
        expect(readStoredPlacementBidAdjustments({})).toEqual({});
    });

    it('returns an empty map when no key survives compaction', () => {
        expect(readStoredPlacementBidAdjustments({ topOfSearch: 0 })).toEqual({});
        expect(readStoredPlacementBidAdjustments({ productPages: 900.5 })).toEqual({});
    });
});

describe('toAmazonPlacementBidAdjustments', () => {
    it('forwards a zero so Amazon clears that placement', () => {
        expect(toAmazonPlacementBidAdjustments({ restOfSearch: 0, productPages: 20 })).toEqual([
            { percentage: 0, placement: 'REST_OF_SEARCH' },
            { percentage: 20, placement: 'PRODUCT_PAGE' },
        ]);
    });

    it('returns undefined when the request omitted placements', () => {
        expect(toAmazonPlacementBidAdjustments(undefined)).toBeUndefined();
    });
});

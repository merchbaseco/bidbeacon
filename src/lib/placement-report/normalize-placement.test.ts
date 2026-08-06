import { describe, expect, it } from 'vitest';
import { normalizePlacement } from './normalize-placement';

describe('placement report source normalization', () => {
    it('maps the supported Amazon placement labels to the public vocabulary', () => {
        expect(normalizePlacement('TOP_OF_SEARCH')).toBe('TOP_OF_SEARCH');
        expect(normalizePlacement('Rest of Search')).toBe('REST_OF_SEARCH');
        expect(normalizePlacement('Product Page')).toBe('PRODUCT_PAGE');
        expect(normalizePlacement('AMAZON_BUSINESS')).toBe('AMAZON_BUSINESS');
        expect(normalizePlacement('SITE_AMAZON_BUSINESS')).toBe('AMAZON_BUSINESS');
    });

    it('rejects an unknown source placement instead of merging it into a known bucket', () => {
        expect(() => normalizePlacement('OTHER_PLACEMENT')).toThrow('Unknown placement source value: OTHER_PLACEMENT');
    });
});

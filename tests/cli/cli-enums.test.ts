import { describe, expect, it } from 'vitest';
import { bidStrategySchema, placementSchema, stateSchema } from '../../src/api/public/schemas';

describe('cli enums', () => {
    it('accepts bid strategy values from export enums', () => {
        expect(bidStrategySchema.parse('SALES')).toBe('SALES');
        expect(bidStrategySchema.parse('NEW_TO_BRAND')).toBe('NEW_TO_BRAND');
        expect(bidStrategySchema.parse('NONE')).toBe('NONE');
    });

    it('accepts state values from export enums', () => {
        expect(stateSchema.parse('OTHER')).toBe('OTHER');
    });

    it('accepts placement values from export enums', () => {
        expect(placementSchema.parse('HOME_PAGE')).toBe('HOME_PAGE');
    });
});

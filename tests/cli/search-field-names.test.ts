import { describe, expect, it } from 'vitest';
import { SEARCH_FIELD_NAMES } from '../../packages/bidbeacon-cli/src/search-field-names';
import { SEARCH_FIELDS } from '../../src/operations/search-field-registry';

describe('CLI search field names', () => {
    it('matches SEARCH_FIELDS', () => {
        expect(SEARCH_FIELD_NAMES).toEqual(new Set(SEARCH_FIELDS));
    });
});

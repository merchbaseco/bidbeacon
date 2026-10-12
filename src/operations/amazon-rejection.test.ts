import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAmazonRejection } from '@/amazon-ads/mutation-error';
import { logger } from '@/utils/logger';
import { logAmazonRejection } from './amazon-rejection';

vi.mock('@/utils/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        child: vi.fn(),
    },
}));

const eligibilityItem = {
    index: 0,
    errors: [
        {
            errorType: 'adEligibilityError',
            errorValue: {
                adEligibilityError: {
                    reason: 'AD_INELIGIBLE',
                    message: 'Product is ineligible for advertising. Listing is not yet advertisable. Authorization: Bearer super-secret-token',
                    cause: { location: 'asin', trigger: 'B0HJ000001' },
                },
            },
        },
    ],
};

const eligibilityDetails = {
    code: 'AD_INELIGIBLE',
    errorCode: 'adEligibilityError',
    field: 'asin',
    index: 0,
    message: 'Product is ineligible for advertising. Listing is not yet advertisable. Authorization: Bearer [redacted]',
    trigger: 'B0HJ000001',
};

const batchItems = [
    eligibilityItem,
    {
        index: 1,
        errors: [
            {
                errorType: 'duplicateValueError',
                errorValue: {
                    duplicateValueError: {
                        reason: 'DUPLICATE_VALUE',
                        message: 'Keyword already exists',
                        cause: { location: 'keywordText', trigger: 'shirt' },
                    },
                },
            },
        ],
    },
];

const batchDetails = {
    code: 'AD_INELIGIBLE',
    errorCode: 'adEligibilityError',
    field: 'asin',
    index: 0,
    message: 'Product is ineligible for advertising. Listing is not yet advertisable. Authorization: Bearer [redacted]',
    trigger: 'B0HJ000001',
    errors: [
        eligibilityDetails,
        {
            code: 'DUPLICATE_VALUE',
            errorCode: 'duplicateValueError',
            field: 'keywordText',
            index: 1,
            message: 'Keyword already exists',
            trigger: 'shirt',
        },
    ],
};

describe('readAmazonRejection', () => {
    beforeEach(() => {
        vi.mocked(logger.error).mockClear();
    });

    it('reads a product-ad eligibility item from a one-element batch', () => {
        expect(readAmazonRejection([eligibilityItem])).toEqual(eligibilityDetails);
    });

    it('keeps the first batch item at the top and lists every item error', () => {
        expect(readAmazonRejection(batchItems)).toEqual(batchDetails);
    });

    it('reads an eligibility body out of an Amazon transport error', () => {
        const error = Object.assign(new Error(`Amazon Ads request failed: 400 Bad Request. ${JSON.stringify({ error: [eligibilityItem] })}`), {
            amazonResponse: { error: [eligibilityItem] },
            statusCode: 400,
        });

        const details = readAmazonRejection(error);

        expect(details).toEqual({ ...eligibilityDetails, statusCode: 400 });
        expect(JSON.stringify(details)).not.toContain('super-secret-token');
        expect(JSON.stringify(details)).not.toContain('Amazon Ads request failed');
    });

    it('redacts a plain transport message and keeps nothing else', () => {
        expect(readAmazonRejection(new Error('Amazon rejected this request with Bearer super-secret-token'))).toEqual({
            message: 'Amazon rejected this request with Bearer [redacted]',
        });
    });

    it('keeps a flat Amazon error as code and message', () => {
        expect(readAmazonRejection({ code: 'INVALID_ARGUMENT', message: 'name already exists' })).toEqual({
            code: 'INVALID_ARGUMENT',
            message: 'name already exists',
        });
    });

    it('returns the same public object when the sanitized result is read again', () => {
        const eligibility = readAmazonRejection([eligibilityItem]);
        const batch = readAmazonRejection(batchItems);
        const plain = readAmazonRejection(new Error('Amazon rejected this request with Bearer super-secret-token'));

        expect(readAmazonRejection(eligibility)).toEqual(eligibility);
        expect(readAmazonRejection(batch)).toEqual(batch);
        expect(readAmazonRejection(plain)).toEqual(plain);
        expect(eligibility).toEqual(eligibilityDetails);
        expect(batch).toEqual(batchDetails);
        expect(plain).toEqual({ message: 'Amazon rejected this request with Bearer [redacted]' });
    });

    it('reads an entityStateError variant, including null sibling keys', () => {
        expect(
            readAmazonRejection([
                {
                    index: 0,
                    errors: [
                        {
                            errorType: 'entityStateError',
                            errorValue: {
                                dateError: null,
                                entityStateError: {
                                    cause: { location: 'asin', trigger: 'B0HJVB2PV7' },
                                    message: 'Parent products cannot be advertised',
                                    reason: 'PARENT_ASIN',
                                },
                                otherError: null,
                            },
                        },
                    ],
                },
            ])
        ).toEqual({
            code: 'PARENT_ASIN',
            errorCode: 'entityStateError',
            field: 'asin',
            index: 0,
            message: 'Parent products cannot be advertised',
            trigger: 'B0HJVB2PV7',
        });
    });

    it('reads an otherError variant and a string errorValue', () => {
        expect(
            readAmazonRejection([
                {
                    index: 0,
                    errors: [
                        {
                            errorType: 'otherError',
                            errorValue: {
                                otherError: {
                                    cause: { location: 'asin', trigger: 'B0HJVB2PV7' },
                                    message: 'Listing is not yet advertisable',
                                    reason: 'NOT_ADVERTISABLE',
                                },
                            },
                        },
                    ],
                },
            ])
        ).toEqual({
            code: 'NOT_ADVERTISABLE',
            errorCode: 'otherError',
            field: 'asin',
            index: 0,
            message: 'Listing is not yet advertisable',
            trigger: 'B0HJVB2PV7',
        });
        expect(
            readAmazonRejection([
                {
                    index: 0,
                    errors: [
                        {
                            errorType: 'otherError',
                            errorValue: { otherError: 'Listing is not yet advertisable' },
                        },
                    ],
                },
            ])
        ).toEqual({
            errorCode: 'otherError',
            index: 0,
            message: 'Listing is not yet advertisable',
        });
    });

    it('reads a bare nested message and top-level details instead of returning only the index', () => {
        expect(readAmazonRejection([{ index: 0, errors: [{ message: 'Parent ASIN cannot be advertised' }] }])).toEqual({
            index: 0,
            message: 'Parent ASIN cannot be advertised',
        });
        expect(readAmazonRejection([{ index: 0, errors: [{ errorType: 'entityStateError', errorValue: { entityStateError: null } }] }])).toEqual({
            code: 'entityStateError',
            errorCode: 'entityStateError',
            index: 0,
        });
        expect(
            readAmazonRejection([
                {
                    index: 0,
                    errors: [{ errorType: 'otherError', errorValue: { otherError: { description: 'Parent ASIN cannot be advertised' } } }],
                },
            ])
        ).toEqual({
            errorCode: 'otherError',
            index: 0,
            message: 'Parent ASIN cannot be advertised',
        });
        expect(
            readAmazonRejection([
                {
                    index: 0,
                    errors: [{ code: 'PARENT_ASIN', details: 'B0HJVB2PV7 is a parent ASIN', message: 'Parent products cannot be advertised' }],
                },
            ])
        ).toEqual({
            code: 'PARENT_ASIN',
            details: 'B0HJVB2PV7 is a parent ASIN',
            index: 0,
            message: 'Parent products cannot be advertised',
        });
    });

    it('logs the full redacted rejection instead of a shallow object', () => {
        logAmazonRejection({ ...eligibilityItem, Authorization: 'Bearer super-secret-token' });

        const logged = vi.mocked(logger.error).mock.calls[0]?.[0];
        expect(typeof logged).toBe('string');
        expect(logged).toContain('Amazon Ads rejected an entity operation');
        expect(logged).toContain('AD_INELIGIBLE');
        expect(logged).toContain('adEligibilityError');
        expect(logged).toContain('B0HJ000001');
        expect(logged).toContain('cause');
        expect(logged).not.toContain('super-secret-token');
        expect(logged).not.toContain('[Array]');
    });
});

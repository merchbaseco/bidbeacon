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
    errors: [
        eligibilityDetails,
        {
            code: 'DUPLICATE_VALUE',
            errorCode: 'duplicateValueError',
            field: 'keywordText',
            index: 1,
            message: 'Keyword already exists',
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

    it('logs the eligibility reason without the bearer token', () => {
        logAmazonRejection(eligibilityItem);

        expect(logger.error).toHaveBeenCalledWith(
            {
                amazonError: {
                    index: 0,
                    errors: [
                        {
                            errorType: 'adEligibilityError',
                            errorValue: {
                                adEligibilityError: {
                                    reason: 'AD_INELIGIBLE',
                                    message: 'Product is ineligible for advertising. Listing is not yet advertisable. Authorization: Bearer [redacted]',
                                    cause: { location: 'asin', trigger: 'B0HJ000001' },
                                },
                            },
                        },
                    ],
                },
            },
            'Amazon Ads rejected an entity operation'
        );
        expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('super-secret-token');
    });
});

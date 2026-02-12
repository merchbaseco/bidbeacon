import { describe, expect, it } from 'vitest';
import { targetDetailOutputSchema, updateAdGroupBidInputSchema, updateTargetBidInputSchema } from '@/types/ads-api';

const baseInput = {
    accountId: 'acc_123',
    adGroupId: 'ag_123',
    targetId: 't_123',
};

describe('ads-api bid input validation', () => {
    it('accepts valid bid amounts', () => {
        expect(
            updateAdGroupBidInputSchema.parse({
                accountId: baseInput.accountId,
                adGroupId: baseInput.adGroupId,
                bidAmount: 1.23,
            })
        ).toBeTruthy();

        expect(
            updateTargetBidInputSchema.parse({
                accountId: baseInput.accountId,
                targetId: baseInput.targetId,
                bidAmount: 10,
            })
        ).toBeTruthy();
    });

    it('rejects invalid bid amounts', () => {
        expect(() =>
            updateAdGroupBidInputSchema.parse({
                accountId: baseInput.accountId,
                adGroupId: baseInput.adGroupId,
                bidAmount: 0,
            })
        ).toThrow();

        expect(() =>
            updateTargetBidInputSchema.parse({
                accountId: baseInput.accountId,
                targetId: baseInput.targetId,
                bidAmount: -1,
            })
        ).toThrow();

        expect(() =>
            updateTargetBidInputSchema.parse({
                accountId: baseInput.accountId,
                targetId: baseInput.targetId,
                bidAmount: 1.234,
            })
        ).toThrow();
    });

    it('keeps target detail schema focused on entity state (no implicit history fields)', () => {
        expect(Object.hasOwn(targetDetailOutputSchema.shape, 'lastBidChangeAt')).toBe(false);
        expect(Object.hasOwn(targetDetailOutputSchema.shape, 'previousBid')).toBe(false);
        expect(Object.hasOwn(targetDetailOutputSchema.shape, 'newBid')).toBe(false);
    });
});

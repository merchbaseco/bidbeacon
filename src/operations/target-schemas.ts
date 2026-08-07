import { z } from 'zod';
import { accountIdSchema } from './operation-schema';

export const targetCreationStateSchema = z.enum(['ENABLED', 'PAUSED']);
export const targetStateSchema = z.enum(['ENABLED', 'PAUSED', 'ARCHIVED']);
export const targetKeywordMatchTypeSchema = z.enum(['BROAD', 'PHRASE', 'EXACT']);
export const targetNegativeKeywordMatchTypeSchema = z.enum(['PHRASE', 'EXACT']);
export const autoTargetMatchTypeSchema = z.enum(['SEARCH_CLOSE_MATCH', 'SEARCH_LOOSE_MATCH', 'PRODUCT_SUBSTITUTES', 'PRODUCT_COMPLEMENTS']);
export const targetTypeSchema = z.enum(['KEYWORD', 'PRODUCT', 'AUTO']);
export const targetAsinSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{10}$/, 'asin must be a 10-character alphanumeric ASIN.');

export const keywordTargetCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        adGroupId: z.string().trim().min(1),
        keyword: z.string().trim().min(1).max(256),
        matchType: targetKeywordMatchTypeSchema,
        bid: z.number().finite().nonnegative(),
        state: targetCreationStateSchema,
    })
    .strict();

export const productTargetCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        adGroupId: z.string().trim().min(1),
        asin: targetAsinSchema,
        bid: z.number().finite().nonnegative(),
        state: targetCreationStateSchema,
    })
    .strict();

export const autoTargetCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        adGroupId: z.string().trim().min(1),
        matchType: autoTargetMatchTypeSchema,
        bid: z.number().finite().nonnegative(),
        state: targetCreationStateSchema,
    })
    .strict();

export const negativeKeywordCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        campaignId: z.string().trim().min(1),
        adGroupId: z.string().trim().min(1),
        keyword: z.string().trim().min(1).max(256),
        matchType: targetNegativeKeywordMatchTypeSchema,
        state: targetCreationStateSchema,
    })
    .strict();

export const negativeProductTargetCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        campaignId: z.string().trim().min(1),
        adGroupId: z.string().trim().min(1),
        asin: targetAsinSchema,
        state: targetCreationStateSchema,
    })
    .strict();

export const targetUpdateChangesSchema = z
    .object({
        state: targetStateSchema.optional(),
        bid: z.number().finite().nonnegative().optional(),
    })
    .strict()
    .refine(value => Object.keys(value).length > 0, 'changes must contain at least one Target control.');

export const targetUpdateInputSchema = z
    .object({
        accountId: accountIdSchema,
        targetId: z.string().trim().min(1),
        changes: targetUpdateChangesSchema,
    })
    .strict();

export const canonicalTargetSchema = z.object({
    id: z.string().min(1),
    campaignId: z.string().min(1),
    adGroupId: z.string().min(1).nullable(),
    state: targetStateSchema,
    deliveryStatus: z.string().min(1),
    type: targetTypeSchema,
    negative: z.boolean(),
    matchType: z.string().min(1).optional(),
    keyword: z.string().min(1).optional(),
    asin: targetAsinSchema.optional(),
    bid: z.number().finite().nonnegative().optional(),
});

export type KeywordTargetCreateInput = z.infer<typeof keywordTargetCreateInputSchema>;
export type ProductTargetCreateInput = z.infer<typeof productTargetCreateInputSchema>;
export type AutoTargetCreateInput = z.infer<typeof autoTargetCreateInputSchema>;
export type NegativeKeywordCreateInput = z.infer<typeof negativeKeywordCreateInputSchema>;
export type NegativeProductTargetCreateInput = z.infer<typeof negativeProductTargetCreateInputSchema>;
export type TargetUpdateChanges = z.infer<typeof targetUpdateChangesSchema>;
export type CanonicalTarget = z.infer<typeof canonicalTargetSchema>;

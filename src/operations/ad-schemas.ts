import { z } from 'zod';
import { accountIdSchema } from './operation-schema';

export const adGroupCreationStateSchema = z.enum(['ENABLED', 'PAUSED']);
export const adGroupStateSchema = z.enum(['ENABLED', 'PAUSED', 'ARCHIVED']);

export const adGroupCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        campaignId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(128),
        state: adGroupCreationStateSchema,
        defaultBid: z.number().finite().nonnegative(),
    })
    .strict();

export const adGroupUpdateChangesSchema = z
    .object({
        state: adGroupStateSchema.optional(),
        defaultBid: z.number().finite().nonnegative().optional(),
    })
    .strict()
    .refine(value => Object.keys(value).length > 0, 'changes must contain at least one Ad group control.');

export const adGroupUpdateInputSchema = z
    .object({
        accountId: accountIdSchema,
        adGroupId: z.string().trim().min(1),
        changes: adGroupUpdateChangesSchema,
    })
    .strict();

export const canonicalAdGroupSchema = z.object({
    id: z.string().min(1),
    campaignId: z.string().min(1),
    name: z.string(),
    state: adGroupStateSchema,
    deliveryStatus: z.string().min(1),
    defaultBid: z.number().finite().nonnegative(),
});

export const adCreationStateSchema = z.enum(['ENABLED', 'PAUSED']);
export const adStateSchema = z.enum(['ENABLED', 'PAUSED', 'ARCHIVED']);
export const asinSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{10}$/, 'asin must be a 10-character alphanumeric ASIN.');

export const adCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        adGroupId: z.string().trim().min(1),
        asin: asinSchema,
        state: adCreationStateSchema,
    })
    .strict();

export const adUpdateChangesSchema = z
    .object({
        state: adStateSchema.optional(),
    })
    .strict()
    .refine(value => Object.keys(value).length > 0, 'changes must contain at least one Ad control.');

export const adUpdateInputSchema = z
    .object({
        accountId: accountIdSchema,
        adId: z.string().trim().min(1),
        changes: adUpdateChangesSchema,
    })
    .strict();

export const canonicalAdSchema = z.object({
    id: z.string().min(1),
    campaignId: z.string().min(1),
    adGroupId: z.string().min(1),
    state: adStateSchema,
    deliveryStatus: z.string().min(1),
    asin: asinSchema,
    productTitle: z.string().nullable(),
});

export type AdGroupCreateInput = z.infer<typeof adGroupCreateInputSchema>;
export type AdGroupUpdateChanges = z.infer<typeof adGroupUpdateChangesSchema>;
export type CanonicalAdGroup = z.infer<typeof canonicalAdGroupSchema>;
export type AdCreateInput = z.infer<typeof adCreateInputSchema>;
export type AdUpdateChanges = z.infer<typeof adUpdateChangesSchema>;
export type CanonicalAd = z.infer<typeof canonicalAdSchema>;

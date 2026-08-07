import { z } from 'zod';
import { asinSchema, canonicalAdGroupSchema, canonicalAdSchema } from './ad-schemas';
import { campaignBidStrategySchema, campaignCreationStateSchema, campaignDateSchema, campaignPlacementBidAdjustmentsSchema, canonicalCampaignSchema } from './campaign-schemas';
import { accountIdSchema } from './operation-schema';
import { canonicalTargetSchema, targetKeywordMatchTypeSchema, targetNegativeKeywordMatchTypeSchema } from './target-schemas';

const compositeKeywordSchema = z
    .object({
        keyword: z.string().trim().min(1).max(256),
        matchType: targetKeywordMatchTypeSchema,
        bid: z.number().finite().nonnegative(),
    })
    .strict();

const negativeKeywordSchema = z
    .object({
        keyword: z.string().trim().min(1).max(256),
        matchType: targetNegativeKeywordMatchTypeSchema,
    })
    .strict();

const compositeProductSchema = z
    .object({
        asin: asinSchema,
        bid: z.number().finite().nonnegative(),
    })
    .strict();

const automaticBidOverridesSchema = z
    .object({
        closeMatch: z.number().finite().nonnegative().optional(),
        looseMatch: z.number().finite().nonnegative().optional(),
        substitutes: z.number().finite().nonnegative().optional(),
        complements: z.number().finite().nonnegative().optional(),
    })
    .strict();

const uniqueAsinsSchema = z
    .array(asinSchema)
    .min(1)
    .superRefine((values, refinementContext) => {
        addDuplicateIssues(values, refinementContext, value => value, 'asins must not contain duplicates.');
    });

const uniqueKeywordsSchema = z
    .array(compositeKeywordSchema)
    .min(1)
    .superRefine((values, refinementContext) => {
        addDuplicateIssues(values, refinementContext, value => `${value.keyword.toLowerCase()}\u0000${value.matchType}`, 'target keywords must not contain duplicates.');
    });

const uniqueNegativeKeywordsSchema = z
    .array(negativeKeywordSchema)
    .min(1)
    .superRefine((values, refinementContext) => {
        addDuplicateIssues(values, refinementContext, value => `${value.keyword.toLowerCase()}\u0000${value.matchType}`, 'negative keywords must not contain duplicates.');
    });

const uniqueProductsSchema = z
    .array(compositeProductSchema)
    .min(1)
    .superRefine((values, refinementContext) => {
        addDuplicateIssues(values, refinementContext, value => value.asin, 'product targets must not contain duplicates.');
    });

export const compositeCampaignCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        campaign: z
            .object({
                name: z.string().trim().min(1).max(128),
                state: campaignCreationStateSchema,
                dailyBudget: z.number().finite().nonnegative(),
                bidStrategy: campaignBidStrategySchema,
                startDate: campaignDateSchema.optional(),
                endDate: campaignDateSchema.nullable().optional(),
                placementBidAdjustments: campaignPlacementBidAdjustmentsSchema.optional(),
            })
            .strict()
            .superRefine((value, refinementContext) => {
                if (value.endDate && value.startDate && value.endDate < value.startDate) {
                    refinementContext.addIssue({ code: z.ZodIssueCode.custom, message: 'endDate must be on or after startDate.', path: ['endDate'] });
                }
            }),
        adGroup: z
            .object({
                name: z.string().trim().min(1).max(128),
                defaultBid: z.number().finite().nonnegative(),
            })
            .strict(),
        asins: uniqueAsinsSchema,
        targeting: z.discriminatedUnion('mode', [
            z
                .object({
                    mode: z.literal('AUTO'),
                    bidOverrides: automaticBidOverridesSchema.optional(),
                })
                .strict(),
            z
                .object({
                    mode: z.literal('MANUAL_KEYWORD'),
                    keywords: uniqueKeywordsSchema,
                })
                .strict(),
            z
                .object({
                    mode: z.literal('MANUAL_PRODUCT'),
                    products: uniqueProductsSchema,
                })
                .strict(),
        ]),
        negatives: z
            .object({
                keywords: uniqueNegativeKeywordsSchema.optional(),
                asins: uniqueAsinsSchema.optional(),
            })
            .strict()
            .superRefine((value, refinementContext) => {
                if (!(value.keywords || value.asins)) {
                    refinementContext.addIssue({ code: z.ZodIssueCode.custom, message: 'negatives must contain at least one target list.' });
                }
            })
            .optional(),
    })
    .strict();

export const compositeCampaignCreationResultSchema = z.object({
    campaign: canonicalCampaignSchema,
    adGroup: canonicalAdGroupSchema,
    ads: z.array(canonicalAdSchema),
    targets: z.array(canonicalTargetSchema),
});

export type CompositeCampaignCreateInput = z.infer<typeof compositeCampaignCreateInputSchema>;
export type CompositeCampaignCreationResult = z.infer<typeof compositeCampaignCreationResultSchema>;

const addDuplicateIssues = <T>(values: T[], refinementContext: z.RefinementCtx, key: (value: T) => string, message: string) => {
    const seen = new Map<string, number>();
    values.forEach((value, index) => {
        const valueKey = key(value);
        const previousIndex = seen.get(valueKey);
        if (previousIndex !== undefined) {
            refinementContext.addIssue({ code: z.ZodIssueCode.custom, message, path: [index] });
            return;
        }
        seen.set(valueKey, index);
    });
};

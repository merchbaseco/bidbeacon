import { z } from 'zod';
import { accountIdSchema } from './operation-schema';

const isCalendarDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const campaignCreationStateSchema = z.enum(['ENABLED', 'PAUSED']);
export const campaignStateSchema = z.enum(['ENABLED', 'PAUSED', 'ARCHIVED']);
export const campaignBidStrategySchema = z.enum(['FIXED', 'DYNAMIC_DOWN_ONLY', 'DYNAMIC_UP_AND_DOWN']);
export const campaignTargetingModeSchema = z.enum(['AUTO', 'MANUAL_KEYWORD', 'MANUAL_PRODUCT']);

export const campaignPlacementBidAdjustmentsSchema = z
    .object({
        topOfSearch: z.number().finite().int().min(0).max(900).optional(),
        restOfSearch: z.number().finite().int().min(0).max(900).optional(),
        productPages: z.number().finite().int().min(0).max(900).optional(),
        amazonBusiness: z.number().finite().int().min(0).max(900).optional(),
    })
    .strict()
    .refine(value => Object.keys(value).length > 0, 'placementBidAdjustments must contain at least one placement.');

export const campaignDateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD.')
    .refine(isCalendarDate, 'Date must be a real calendar date.');

export const campaignCreateInputSchema = z
    .object({
        accountId: accountIdSchema,
        name: z.string().trim().min(1).max(128),
        state: campaignCreationStateSchema,
        dailyBudget: z.number().finite().nonnegative(),
        bidStrategy: campaignBidStrategySchema,
        targetingMode: campaignTargetingModeSchema,
        startDate: campaignDateSchema,
        endDate: campaignDateSchema.nullable().optional(),
        placementBidAdjustments: campaignPlacementBidAdjustmentsSchema.optional(),
    })
    .strict()
    .superRefine((value, refinementContext) => {
        if (value.endDate && value.endDate < value.startDate) {
            refinementContext.addIssue({ code: z.ZodIssueCode.custom, message: 'endDate must be on or after startDate.', path: ['endDate'] });
        }
    });

export const campaignUpdateChangesSchema = z
    .object({
        state: campaignStateSchema.optional(),
        dailyBudget: z.number().finite().nonnegative().optional(),
        bidStrategy: campaignBidStrategySchema.optional(),
        placementBidAdjustments: campaignPlacementBidAdjustmentsSchema.optional(),
    })
    .strict()
    .refine(value => Object.keys(value).length > 0, 'changes must contain at least one Campaign control.');

export const campaignUpdateInputSchema = z
    .object({
        accountId: accountIdSchema,
        campaignId: z.string().trim().min(1),
        changes: campaignUpdateChangesSchema,
    })
    .strict();

export const canonicalCampaignSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
    state: campaignStateSchema,
    deliveryStatus: z.string().min(1),
    dailyBudget: z.number().finite().nonnegative(),
    bidStrategy: campaignBidStrategySchema,
    targetingMode: campaignTargetingModeSchema,
    startDate: campaignDateSchema,
    endDate: campaignDateSchema.nullable(),
    placementBidAdjustments: campaignPlacementBidAdjustmentsSchema.optional(),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateInputSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateInputSchema>;
export type CampaignUpdateChanges = z.infer<typeof campaignUpdateChangesSchema>;
export type CanonicalCampaign = z.infer<typeof canonicalCampaignSchema>;

import { z } from 'zod';
import { ad, adGroup, advertiserAccount, campaign, entityChangeHistory, performanceDaily, performanceHourly, productMetadata, reportDatasetMetadata, target, userAccountAccess, userPreferences } from '@/db/schema';

export const operationSchema = {
    ad,
    adGroup,
    advertiserAccount,
    campaign,
    entityChangeHistory,
    performanceDaily,
    performanceHourly,
    productMetadata,
    reportDatasetMetadata,
    target,
    userAccountAccess,
    userPreferences,
};

export const accountIdSchema = z.string().uuid();
export const accountScopedInputSchema = z.object({ accountId: accountIdSchema }).strict();
export const listAdvertiserAccountsInputSchema = z.object({}).strict();

export const advertiserAccountOutputSchema = z.object({
    amazonAdsAccountId: z.string(),
    countryCode: z.string(),
    currency: z.string(),
    id: accountIdSchema,
    marketplaceId: z.string(),
    name: z.string(),
    profileId: z.string().nullable(),
    timezone: z.string(),
});

export const listAdvertiserAccountsOutputSchema = z.object({ accounts: z.array(advertiserAccountOutputSchema) });

import { asc, eq, inArray } from 'drizzle-orm';
import { advertiserAccount } from '@/db/schema';
import { getAdvertiserAccountMetadata } from '@/utils/advertiser-account-metadata';
import type { OperationContext } from './operation-context';
import { OperationError } from './operation-errors';
import { accountScopedInputSchema, listAdvertiserAccountsInputSchema, listAdvertiserAccountsOutputSchema } from './operation-schema';

export const listAdvertiserAccounts = async (context: OperationContext, input: unknown = {}) => {
    const parsedInput = listAdvertiserAccountsInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new OperationError('INVALID_INPUT', 'list_advertiser_accounts does not accept routing or account-selection input.', { issues: parsedInput.error.issues });
    }

    const principal = requirePrincipal(context);
    if (principal.accessibleAccountIds.length === 0) {
        return { accounts: [] };
    }

    const rows = await context.db
        .select()
        .from(advertiserAccount)
        .where(inArray(advertiserAccount.id, [...principal.accessibleAccountIds]))
        .orderBy(asc(advertiserAccount.accountName), asc(advertiserAccount.countryCode), asc(advertiserAccount.id));

    return listAdvertiserAccountsOutputSchema.parse({ accounts: rows.map(mapAdvertiserAccount) });
};

export const resolveAdvertiserAccount = async (context: OperationContext, input: unknown) => {
    const parsed = accountScopedInputSchema.safeParse(input);
    if (!parsed.success) {
        throw new OperationError('INVALID_INPUT', 'accountId must be a BidBeacon Advertiser Account UUID.', { issues: parsed.error.issues });
    }

    const principal = requirePrincipal(context);
    if (!principal.accessibleAccountIds.includes(parsed.data.accountId)) {
        throw new OperationError('ACCOUNT_ACCESS_DENIED', 'The caller cannot access this Advertiser Account.');
    }

    const rows = await context.db.select().from(advertiserAccount).where(eq(advertiserAccount.id, parsed.data.accountId)).limit(1);
    const account = rows[0];
    if (!account) {
        throw new OperationError('ACCOUNT_ACCESS_DENIED', 'The caller cannot access this Advertiser Account.');
    }

    return account;
};

export const assertAdvertiserAccountAccess = async (context: OperationContext, accountId: string) => {
    await resolveAdvertiserAccount(context, { accountId });
};

const requirePrincipal = (context: OperationContext) => {
    if (!context.principal) {
        throw new OperationError('AUTHENTICATION_REQUIRED', 'An authenticated operation principal is required.');
    }

    return context.principal;
};

const mapAdvertiserAccount = (account: typeof advertiserAccount.$inferSelect) => ({
    ...getAdvertiserAccountMetadata(account.countryCode),
    amazonAdsAccountId: account.adsAccountId,
    countryCode: account.countryCode.toUpperCase(),
    id: account.id,
    name: account.accountName,
    profileId: account.profileId,
});

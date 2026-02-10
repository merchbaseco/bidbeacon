import { accountsListOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { db } from '@/db/index';

export const accountsList = apiProcedure.output(accountsListOutputSchema).query(async ({ ctx }) => {
    if (ctx.accessibleAccountIds.length === 0) {
        return { items: [] };
    }

    const rows = await db.query.advertiserAccount.findMany({
        where: (table, { inArray }) => inArray(table.adsAccountId, ctx.accessibleAccountIds),
    });

    return {
        items: rows.map(row => ({
            accountId: row.adsAccountId,
            name: row.accountName ?? null,
            countryCode: row.countryCode ?? null,
        })),
    };
});

import { and, asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { advertiserAccount, userAccountAccess } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { buildAdvertiserAccount } from '@/operations/testing/fixtures';
import { expandAdvertiserAccountMemberships } from './advertiser-account-memberships';

const existingAccountId = '00000000-0000-4000-8000-000000000001';
const newMarketplaceAccountId = '00000000-0000-4000-8000-000000000002';
const unrelatedAccountId = '00000000-0000-4000-8000-000000000003';

describe('Advertiser Account membership expansion', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
    });

    it('links a new marketplace profile to every existing Amazon-account member and the syncing user', async () => {
        database = await createTestDatabase();
        await database.db
            .insert(advertiserAccount)
            .values([
                buildAdvertiserAccount({ id: existingAccountId, adsAccountId: 'shared-amazon-account', countryCode: 'US', profileId: '1001' }),
                buildAdvertiserAccount({ id: newMarketplaceAccountId, adsAccountId: 'shared-amazon-account', countryCode: 'CA', profileId: '1002' }),
                buildAdvertiserAccount({ id: unrelatedAccountId, adsAccountId: 'unrelated-amazon-account', countryCode: 'US', profileId: '2001' }),
            ]);
        await database.db.insert(userAccountAccess).values([
            {
                advertiserAccountId: existingAccountId,
                adsAccountId: 'shared-amazon-account',
                merchbaseUserId: 'mbu_existing_one',
            },
            {
                advertiserAccountId: existingAccountId,
                adsAccountId: 'shared-amazon-account',
                merchbaseUserId: 'mbu_existing_two',
            },
            {
                advertiserAccountId: unrelatedAccountId,
                adsAccountId: 'unrelated-amazon-account',
                merchbaseUserId: 'mbu_unrelated',
            },
        ]);

        const input = {
            actorMerchbaseUserId: 'mbu_syncing',
            advertiserAccountId: newMarketplaceAccountId,
            adsAccountId: 'shared-amazon-account',
        };
        await expandAdvertiserAccountMemberships(database.db as never, input);
        await expandAdvertiserAccountMemberships(database.db as never, input);

        const rows = await database.db
            .select({ merchbaseUserId: userAccountAccess.merchbaseUserId })
            .from(userAccountAccess)
            .where(and(eq(userAccountAccess.advertiserAccountId, newMarketplaceAccountId), eq(userAccountAccess.adsAccountId, 'shared-amazon-account')))
            .orderBy(asc(userAccountAccess.merchbaseUserId));

        expect(rows).toEqual([{ merchbaseUserId: 'mbu_existing_one' }, { merchbaseUserId: 'mbu_existing_two' }, { merchbaseUserId: 'mbu_syncing' }]);
    });
});

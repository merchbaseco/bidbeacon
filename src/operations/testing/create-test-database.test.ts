import { afterEach, describe, expect, it } from 'vitest';
import { ad, adGroup, advertiserAccount, campaign, entityChangeHistory, performanceDaily, performanceHourly, reportDatasetMetadata, target, userAccountAccess } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from './create-test-database';
import {
    buildAd,
    buildAdGroup,
    buildAdvertiserAccount,
    buildCampaign,
    buildEntityChangeHistory,
    buildPerformanceDaily,
    buildPerformanceHourly,
    buildReportDatasetMetadata,
    buildTarget,
    buildUserAccountAccess,
} from './fixtures';

describe('createTestDatabase', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
    });

    it('creates an isolated in-memory database with the production archive schema', async () => {
        database = await createTestDatabase();
        await database.db.insert(performanceDaily).values(
            buildPerformanceDaily({
                accountId: 'account-us',
                bucketDate: '2026-08-05',
                adId: 'ad-1',
                entityId: 'asin-1',
            })
        );

        const rows = await database.db
            .select({
                accountId: performanceDaily.accountId,
                bucketDate: performanceDaily.bucketDate,
                adId: performanceDaily.adId,
                entityId: performanceDaily.entityId,
            })
            .from(performanceDaily);

        expect(rows).toEqual([
            {
                accountId: 'account-us',
                bucketDate: '2026-08-05',
                adId: 'ad-1',
                entityId: 'asin-1',
            },
        ]);
    });

    it('accepts the durable operation fixture vocabulary', async () => {
        database = await createTestDatabase();

        await database.db.insert(advertiserAccount).values(buildAdvertiserAccount());
        await database.db.insert(userAccountAccess).values(buildUserAccountAccess());
        await database.db.insert(campaign).values(buildCampaign());
        await database.db.insert(adGroup).values(buildAdGroup());
        await database.db.insert(ad).values(buildAd());
        await database.db.insert(target).values(buildTarget());
        await database.db.insert(performanceHourly).values(buildPerformanceHourly());
        await database.db.insert(performanceDaily).values(buildPerformanceDaily());
        await database.db.insert(reportDatasetMetadata).values(buildReportDatasetMetadata());
        await database.db.insert(entityChangeHistory).values(buildEntityChangeHistory());

        await expect(database.db.select({ id: advertiserAccount.id }).from(advertiserAccount)).resolves.toHaveLength(1);
        await expect(database.db.select({ id: campaign.id }).from(campaign)).resolves.toHaveLength(1);
        await expect(database.db.select({ id: entityChangeHistory.id }).from(entityChangeHistory)).resolves.toHaveLength(1);
    });

    it('does not persist rows between database instances', async () => {
        const firstDatabase = await createTestDatabase();
        await firstDatabase.db.insert(performanceDaily).values(buildPerformanceDaily());
        await firstDatabase.close();

        database = await createTestDatabase();

        await expect(database.db.select().from(performanceDaily)).resolves.toEqual([]);
    });
});

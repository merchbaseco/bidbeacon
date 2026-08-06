import { afterEach, describe, expect, it } from 'vitest';
import { performanceDaily } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { queryArchivedPerformance } from './archive-query';
import { createOperationContext } from './operation-context';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import { buildPerformanceDaily } from './testing/fixtures';

describe('queryArchivedPerformance', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
    });

    it('queries the real archive table through an injected Drizzle connection', async () => {
        database = await createTestDatabase();
        await database.db.insert(performanceDaily).values([
            buildPerformanceDaily({
                accountId: 'ads-account-us',
                bucketDate: '2026-08-05',
                adId: 'ad-1',
                entityId: 'asin-1',
            }),
            buildPerformanceDaily({
                accountId: 'ads-account-us',
                bucketStart: new Date('2026-08-06T07:00:00.000Z'),
                bucketDate: '2026-08-06',
                adId: 'ad-2',
                entityId: 'asin-2',
            }),
            buildPerformanceDaily({
                accountId: 'ads-account-other',
                adId: 'ad-3',
                entityId: 'asin-3',
            }),
        ]);

        const rows = await queryArchivedPerformance(createOperationContext({ amazonAds: createFakeAmazonAdsGateway(), db: database.db }), {
            storageAccountId: 'ads-account-us',
            startDate: '2026-08-05',
            endDate: '2026-08-05',
        });

        expect(rows.map(row => ({ accountId: row.accountId, bucketDate: row.bucketDate, adId: row.adId, entityId: row.entityId }))).toEqual([
            {
                accountId: 'ads-account-us',
                bucketDate: '2026-08-05',
                adId: 'ad-1',
                entityId: 'asin-1',
            },
        ]);
    });
});

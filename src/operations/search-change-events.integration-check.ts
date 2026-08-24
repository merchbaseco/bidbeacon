// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: every test here boots a WebAssembly Postgres
// and applies the production migrations, which costs seconds per test and far
// more on a cold CI runner. It runs in the `test:integration` lane instead, via
// `vitest.integration.config.ts`. `bun run check` runs both lanes; the Quality
// workflow runs `check:fast`, the fast lane only. Add new database-backed
// suites with the same suffix — the lane is structural, with no list to keep.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advertiserAccount, entityChangeHistory } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext, type OperationContext } from './operation-context';
import { search } from './search';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import { buildSearchChangeEvent, buildSearchChangeEventAdvertiserAccount, SEARCH_CHANGE_EVENT_ACCOUNT_ID } from './testing/search-change-event-fixtures';

describe('Change-event Search operation', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('returns inclusive account-local Change events with canonical identity, actor, field, values, and timestamp', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchChangeEventAdvertiserAccount());
        await database.db.insert(entityChangeHistory).values([
            buildSearchChangeEvent(),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000512',
                localDate: '2026-08-07',
                entityType: 'target',
                entityId: 'search-change-event-target-1',
                eventType: 'bid_change',
                fieldName: 'bidAmount',
                previousValue: '0.40',
                newValue: '0.55',
                changedAt: new Date('2026-08-07T01:00:00.000Z'),
                source: 'bidbeacon',
            }),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000513',
                localDate: '2026-08-07',
                entityType: 'adGroup',
                entityId: 'search-change-event-ad-group-1',
                eventType: 'bid_change',
                fieldName: 'bidAmount',
                previousValue: '0.30',
                newValue: '0.35',
                changedAt: new Date('2026-08-07T00:00:00.000Z'),
                source: 'ams',
            }),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000514',
                localDate: '2026-08-08',
                changedAt: new Date('2026-08-08T01:00:00.000Z'),
            }),
        ]);

        const result = await search(createSearchContext(database), {
            accountId: SEARCH_CHANGE_EVENT_ACCOUNT_ID,
            resource: 'change_event',
            fields: [
                'changeEvent.id',
                'changeEvent.resourceType',
                'changeEvent.resourceId',
                'changeEvent.eventType',
                'changeEvent.field',
                'changeEvent.previousValue',
                'changeEvent.newValue',
                'changeEvent.changedAt',
                'changeEvent.source',
            ],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-07' },
        });

        expect(result.context).toEqual({
            account: { id: SEARCH_CHANGE_EVENT_ACCOUNT_ID, timezone: 'America/Los_Angeles', currency: 'USD' },
            resource: 'change_event',
            fields: [
                'changeEvent.id',
                'changeEvent.resourceType',
                'changeEvent.resourceId',
                'changeEvent.eventType',
                'changeEvent.field',
                'changeEvent.previousValue',
                'changeEvent.newValue',
                'changeEvent.changedAt',
                'changeEvent.source',
            ],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-07', source: 'EXPLICIT' },
            orderBy: [
                { field: 'changeEvent.changedAt', direction: 'desc' },
                { field: 'changeEvent.id', direction: 'asc' },
            ],
        });
        expect(result.rows).toEqual([
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000512',
                'changeEvent.resourceType': 'target',
                'changeEvent.resourceId': 'search-change-event-target-1',
                'changeEvent.eventType': 'BID_CHANGED',
                'changeEvent.field': 'bid',
                'changeEvent.previousValue': 0.4,
                'changeEvent.newValue': 0.55,
                'changeEvent.changedAt': '2026-08-07T01:00:00.000Z',
                'changeEvent.source': 'BIDBEACON',
            },
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000513',
                'changeEvent.resourceType': 'ad_group',
                'changeEvent.resourceId': 'search-change-event-ad-group-1',
                'changeEvent.eventType': 'BID_CHANGED',
                'changeEvent.field': 'defaultBid',
                'changeEvent.previousValue': 0.3,
                'changeEvent.newValue': 0.35,
                'changeEvent.changedAt': '2026-08-07T00:00:00.000Z',
                'changeEvent.source': 'AMAZON_MARKETING_STREAM',
            },
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000511',
                'changeEvent.resourceType': 'campaign',
                'changeEvent.resourceId': 'search-change-event-campaign-1',
                'changeEvent.eventType': 'STATE_CHANGED',
                'changeEvent.field': 'state',
                'changeEvent.previousValue': 'PAUSED',
                'changeEvent.newValue': 'ENABLED',
                'changeEvent.changedAt': '2026-08-06T15:00:00.000Z',
                'changeEvent.source': 'AMAZON_CHANGE_HISTORY',
            },
        ]);
        expect(result.context).not.toHaveProperty('coverage');
    });

    it('uses the inclusive account-local seven-day default, filters values, and continues deterministically', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildSearchChangeEventAdvertiserAccount(),
            buildSearchChangeEventAdvertiserAccount({
                id: '00000000-0000-4000-8000-000000000502',
                accountName: 'Search change-event Canada advertiser',
                countryCode: 'CA',
                profileId: 'search-change-event-profile-2',
                entityId: 'search-change-event-entity-2',
            }),
        ]);
        await database.db.insert(entityChangeHistory).values([
            buildSearchChangeEvent({ changedAt: new Date('2026-08-01T15:00:00.000Z'), localDate: '2026-08-01' }),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000512',
                localDate: '2026-08-07',
                entityType: 'target',
                entityId: 'search-change-event-target-1',
                eventType: 'bid_change',
                fieldName: 'bidAmount',
                previousValue: '0.40',
                newValue: '0.55',
                changedAt: new Date('2026-08-07T01:00:00.000Z'),
                source: 'bidbeacon',
            }),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000513',
                localDate: '2026-08-08',
                changedAt: new Date('2026-08-08T01:00:00.000Z'),
            }),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000514',
                countryCode: 'CA',
                localDate: '2026-08-07',
                entityId: 'search-change-event-canada-campaign-1',
                changedAt: new Date('2026-08-07T02:00:00.000Z'),
            }),
        ]);

        const input = {
            accountId: SEARCH_CHANGE_EVENT_ACCOUNT_ID,
            resource: 'change_event' as const,
            fields: ['changeEvent.id', 'changeEvent.changedAt', 'changeEvent.newValue', 'changeEvent.source'],
            limit: 1,
        };
        const firstPage = await search(createSearchContext(database), input);
        expect(firstPage.context.dateRange).toEqual({ startDate: '2026-08-01', endDate: '2026-08-07', source: 'DEFAULT' });
        expect(firstPage.context.orderBy).toEqual([
            { field: 'changeEvent.changedAt', direction: 'desc' },
            { field: 'changeEvent.id', direction: 'asc' },
        ]);
        expect(firstPage.context).not.toHaveProperty('coverage');
        expect(firstPage.rows).toEqual([
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000512',
                'changeEvent.changedAt': '2026-08-07T01:00:00.000Z',
                'changeEvent.newValue': 0.55,
                'changeEvent.source': 'BIDBEACON',
            },
        ]);
        expect(firstPage.nextCursor).toEqual(expect.any(String));

        const secondPage = await search(createSearchContext(database), { ...input, cursor: firstPage.nextCursor });
        expect(secondPage.rows).toEqual([
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000511',
                'changeEvent.changedAt': '2026-08-01T15:00:00.000Z',
                'changeEvent.newValue': 'ENABLED',
                'changeEvent.source': 'AMAZON_CHANGE_HISTORY',
            },
        ]);
        expect(secondPage.nextCursor).toBeUndefined();

        const filtered = await search(createSearchContext(database), {
            ...input,
            fields: ['changeEvent.id', 'changeEvent.newValue'],
            filters: [{ field: 'changeEvent.newValue', operator: 'eq', value: 0.55 }],
        });
        expect(filtered.rows).toEqual([{ 'changeEvent.id': '00000000-0000-4000-8000-000000000512', 'changeEvent.newValue': 0.55 }]);
    });

    it('maps strategy and placement changes and filters structured values at canonical timestamp instants', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildSearchChangeEventAdvertiserAccount());
        await database.db.insert(entityChangeHistory).values([
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000521',
                eventType: 'bid_change',
                fieldName: 'placementBidAdjustments',
                previousValue: '{"productPages":10,"topOfSearch":25}',
                newValue: '{"productPages":20,"topOfSearch":50}',
            }),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000522',
                eventType: 'bid_change',
                fieldName: 'placementBidAdjustments',
                previousValue: '{"productPages":20}',
                newValue: '{"productPages":30}',
                changedAt: new Date('2026-08-06T14:00:00.000Z'),
            }),
            buildSearchChangeEvent({
                id: '00000000-0000-4000-8000-000000000523',
                eventType: 'bid_change',
                fieldName: 'bidStrategy',
                previousValue: 'DYNAMIC_DOWN_ONLY',
                newValue: 'DYNAMIC_UP_AND_DOWN',
                changedAt: new Date('2026-08-06T13:00:00.000Z'),
            }),
        ]);

        const mapped = await search(createSearchContext(database), {
            accountId: SEARCH_CHANGE_EVENT_ACCOUNT_ID,
            resource: 'change_event',
            fields: ['changeEvent.id', 'changeEvent.field', 'changeEvent.previousValue', 'changeEvent.newValue', 'changeEvent.changedAt'],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(mapped.rows).toEqual([
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000521',
                'changeEvent.field': 'placementBidAdjustments',
                'changeEvent.previousValue': { productPages: 10, topOfSearch: 25 },
                'changeEvent.newValue': { productPages: 20, topOfSearch: 50 },
                'changeEvent.changedAt': '2026-08-06T15:00:00.000Z',
            },
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000522',
                'changeEvent.field': 'placementBidAdjustments',
                'changeEvent.previousValue': { productPages: 20 },
                'changeEvent.newValue': { productPages: 30 },
                'changeEvent.changedAt': '2026-08-06T14:00:00.000Z',
            },
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000523',
                'changeEvent.field': 'bidStrategy',
                'changeEvent.previousValue': 'DYNAMIC_DOWN_ONLY',
                'changeEvent.newValue': 'DYNAMIC_UP_AND_DOWN',
                'changeEvent.changedAt': '2026-08-06T13:00:00.000Z',
            },
        ]);

        const filtered = await search(createSearchContext(database), {
            accountId: SEARCH_CHANGE_EVENT_ACCOUNT_ID,
            resource: 'change_event',
            fields: ['changeEvent.id', 'changeEvent.newValue', 'changeEvent.changedAt'],
            filters: [
                { field: 'changeEvent.newValue', operator: 'eq', value: { topOfSearch: 50, productPages: 20 } },
                { field: 'changeEvent.changedAt', operator: 'eq', value: '2026-08-06T08:00:00-07:00' },
            ],
            dateRange: { startDate: '2026-08-06', endDate: '2026-08-06' },
        });

        expect(filtered.rows).toEqual([
            {
                'changeEvent.id': '00000000-0000-4000-8000-000000000521',
                'changeEvent.newValue': { productPages: 20, topOfSearch: 50 },
                'changeEvent.changedAt': '2026-08-06T15:00:00.000Z',
            },
        ]);
    });
});

const createSearchContext = (database: TestDatabase, accessibleAccountIds: string[] = [SEARCH_CHANGE_EVENT_ACCOUNT_ID]): OperationContext =>
    createOperationContext({
        amazonAds: createFakeAmazonAdsGateway(),
        db: database.db,
        principal: {
            accessibleAccountIds,
            credentialKind: 'session',
            merchbaseUserId: 'search-change-event-test-user',
        },
    });

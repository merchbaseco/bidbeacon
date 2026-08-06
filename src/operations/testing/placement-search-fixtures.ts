import type { InferInsertModel } from 'drizzle-orm';
import type { performanceDailyPlacement } from '@/db/schema';

type PlacementPerformanceInsert = InferInsertModel<typeof performanceDailyPlacement>;

export const buildSearchPlacementPerformanceDaily = (overrides: Partial<PlacementPerformanceInsert> = {}): PlacementPerformanceInsert => ({
    accountId: 'search-ads-account-1',
    countryCode: 'US',
    bucketStart: new Date('2026-08-06T07:00:00.000Z'),
    bucketDate: '2026-08-06',
    campaignId: 'campaign-search-1',
    placement: 'TOP_OF_SEARCH',
    impressions: 100,
    clicks: 10,
    spend: '10.00',
    sales: '40.00',
    purchases: 2,
    ...overrides,
});

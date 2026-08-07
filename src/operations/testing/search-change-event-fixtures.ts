import type { InferInsertModel } from 'drizzle-orm';
import type { advertiserAccount, entityChangeHistory } from '@/db/schema';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type EntityChangeHistoryInsert = InferInsertModel<typeof entityChangeHistory>;

export const SEARCH_CHANGE_EVENT_ACCOUNT_ID = '00000000-0000-4000-8000-000000000501';
export const SEARCH_CHANGE_EVENT_OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000502';

export const buildSearchChangeEventAdvertiserAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: SEARCH_CHANGE_EVENT_ACCOUNT_ID,
    adsAccountId: 'search-change-event-ads-account-1',
    accountName: 'Search change-event advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: 'search-change-event-profile-1',
    entityId: 'search-change-event-entity-1',
    enabled: true,
    ...overrides,
});

export const buildSearchChangeEvent = (overrides: Partial<EntityChangeHistoryInsert> = {}): EntityChangeHistoryInsert => ({
    id: '00000000-0000-4000-8000-000000000511',
    accountId: 'search-change-event-ads-account-1',
    countryCode: 'US',
    localDate: '2026-08-06',
    entityType: 'campaign',
    entityId: 'search-change-event-campaign-1',
    eventType: 'state_change',
    fieldName: 'state',
    previousValue: 'PAUSED',
    newValue: 'ENABLED',
    changedAt: new Date('2026-08-06T15:00:00.000Z'),
    source: 'change_history',
    rawPayload: { campaignId: 'search-change-event-campaign-1' },
    ...overrides,
});

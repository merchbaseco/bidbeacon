import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { entityChangeHistory } from '@/db/schema';
import type { OperationContext } from './operation-context';
import type { SearchPlan } from './search-planner';
import type { SearchRow } from './search-query';

export const queryChangeEventSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<SearchRow[]> => {
    const rows = await context.db
        .select()
        .from(entityChangeHistory)
        .where(
            and(
                eq(entityChangeHistory.accountId, account.adsAccountId),
                eq(entityChangeHistory.countryCode, account.countryCode),
                gte(entityChangeHistory.localDate, plan.dateRange?.startDate ?? ''),
                lte(entityChangeHistory.localDate, plan.dateRange?.endDate ?? '')
            )
        )
        .orderBy(desc(entityChangeHistory.changedAt), asc(entityChangeHistory.id));

    return rows.map(row => ({
        values: {
            'changeEvent.id': row.id,
            'changeEvent.resourceType': normalizeResourceType(row.entityType),
            'changeEvent.resourceId': row.entityId,
            'changeEvent.eventType': normalizeEventType(row.eventType),
            'changeEvent.field': normalizeField(row.entityType, row.fieldName),
            'changeEvent.previousValue': parseHistoryValue(row.previousValue),
            'changeEvent.newValue': parseHistoryValue(row.newValue),
            'changeEvent.changedAt': row.changedAt.toISOString(),
            'changeEvent.source': normalizeSource(row.source),
        },
    }));
};

const normalizeResourceType = (value: string) => {
    switch (value) {
        case 'adGroup':
        case 'ad_group':
            return 'ad_group';
        default:
            return value.toLowerCase();
    }
};

const normalizeEventType = (value: string) => {
    switch (value) {
        case 'state_change':
            return 'STATE_CHANGED';
        case 'bid_change':
            return 'BID_CHANGED';
        case 'budget_change':
            return 'DAILY_BUDGET_CHANGED';
        default:
            return `${value.toUpperCase()}_CHANGED`;
    }
};

const normalizeField = (resourceType: string, value: string) => {
    if (value === 'budgetAmount') {
        return 'dailyBudget';
    }
    if (value === 'bidAmount' || value === 'defaultBidAmount') {
        return resourceType === 'adGroup' || resourceType === 'ad_group' ? 'defaultBid' : resourceType === 'target' ? 'bid' : 'bid';
    }
    return value;
};

const normalizeSource = (value: string) => {
    switch (value) {
        case 'bidbeacon':
            return 'BIDBEACON';
        case 'ams':
            return 'AMAZON_MARKETING_STREAM';
        case 'change_history':
            return 'AMAZON_CHANGE_HISTORY';
        default:
            return value.toUpperCase();
    }
};

const parseHistoryValue = (value: string | null) => {
    if (value === null) {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed === '') {
        return value;
    }

    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return value;
    }
};

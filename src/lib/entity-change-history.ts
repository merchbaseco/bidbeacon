import { formatInTimeZone } from 'date-fns-tz';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { entityChangeHistory } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';

const ENTITY_CHANGE_SOURCES = ['bidbeacon', 'ams', 'change_history'] as const;
const ENTITY_CHANGE_EVENT_TYPES = ['bid_change', 'state_change', 'budget_change'] as const;
const ENTITY_CHANGE_ENTITY_TYPES = ['campaign', 'adGroup', 'ad', 'target'] as const;

type EntityChangeSource = (typeof ENTITY_CHANGE_SOURCES)[number];
type EntityChangeEventType = (typeof ENTITY_CHANGE_EVENT_TYPES)[number];
type EntityChangeEntityType = (typeof ENTITY_CHANGE_ENTITY_TYPES)[number];

type RecordEntityChangeInput = {
    accountId: string;
    countryCode: string | null;
    entityType: EntityChangeEntityType;
    entityId: string;
    eventType: EntityChangeEventType;
    fieldName: string;
    previousValue: string | number | null | undefined;
    newValue: string | number | null | undefined;
    changedAt: Date;
    source: EntityChangeSource;
    rawPayload?: unknown;
};

type LastBidChange = {
    lastBidChangeAt: string;
    previousBid: number | null;
    newBid: number | null;
};

export const recordEntityChange = async (input: RecordEntityChangeInput) => {
    const previousValue = normalizeHistoryValue(input.previousValue);
    const newValue = normalizeHistoryValue(input.newValue);

    if (previousValue === newValue) {
        return;
    }

    const localDate = resolveLocalDate(input.changedAt, input.countryCode);

    await db
        .insert(entityChangeHistory)
        .values({
            accountId: input.accountId,
            countryCode: input.countryCode,
            localDate,
            entityType: input.entityType,
            entityId: input.entityId,
            eventType: input.eventType,
            fieldName: input.fieldName,
            previousValue,
            newValue,
            changedAt: input.changedAt,
            source: input.source,
            rawPayload: input.rawPayload ?? null,
        })
        .onConflictDoNothing({
            target: [
                entityChangeHistory.accountId,
                entityChangeHistory.countryCode,
                entityChangeHistory.entityType,
                entityChangeHistory.entityId,
                entityChangeHistory.eventType,
                entityChangeHistory.fieldName,
                entityChangeHistory.changedAt,
                entityChangeHistory.newValue,
                entityChangeHistory.source,
            ],
        });
};

export const getLastBidChangeForEntity = async (input: { accountId: string; countryCode?: string | null; entityType: EntityChangeEntityType; entityId: string }): Promise<LastBidChange | null> => {
    const conditions = [
        eq(entityChangeHistory.accountId, input.accountId),
        eq(entityChangeHistory.entityType, input.entityType),
        eq(entityChangeHistory.entityId, input.entityId),
        eq(entityChangeHistory.eventType, 'bid_change'),
    ];

    if (input.countryCode) {
        conditions.push(eq(entityChangeHistory.countryCode, input.countryCode));
    }

    const [row] = await db
        .select({
            changedAt: entityChangeHistory.changedAt,
            previousValue: entityChangeHistory.previousValue,
            newValue: entityChangeHistory.newValue,
        })
        .from(entityChangeHistory)
        .where(and(...conditions))
        .orderBy(desc(entityChangeHistory.changedAt))
        .limit(1);

    if (!row) {
        return null;
    }

    return {
        lastBidChangeAt: row.changedAt.toISOString(),
        previousBid: parseNullableNumber(row.previousValue),
        newBid: parseNullableNumber(row.newValue),
    };
};

const normalizeHistoryValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : null;
    }
    return value;
};

const parseNullableNumber = (value: string | null) => {
    if (value === null) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const resolveLocalDate = (changedAt: Date, countryCode: string | null) => {
    if (!countryCode) {
        return changedAt.toISOString().slice(0, 10);
    }

    const timezone = getTimezoneForCountry(countryCode);
    return formatInTimeZone(changedAt, timezone, 'yyyy-MM-dd');
};

export { ENTITY_CHANGE_ENTITY_TYPES, ENTITY_CHANGE_EVENT_TYPES, ENTITY_CHANGE_SOURCES, type EntityChangeEntityType, type EntityChangeEventType, type EntityChangeSource };

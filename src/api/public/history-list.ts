import { TRPCError } from '@trpc/server';
import { addDays, format, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { historyListInputSchema, historyListOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { db } from '@/db/index';
import { entityChangeHistory } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import { assertAccountAccess } from './shared';

const DEFAULT_HISTORY_LIMIT = 20;
const DAYS_RANGE_REGEX = /^(\d+)d$/;

export const historyList = apiProcedure
    .input(historyListInputSchema)
    .output(historyListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);

        const countryCode = normalizeCountryCode(input.config.countryCode);
        const timezone = countryCode ? getTimezoneForCountry(countryCode) : 'UTC';
        const rangeValue = resolveRangeOverride(input.config.range, input.range);
        const range = parseHistoryRange(rangeValue, timezone);
        const limit = input.limit ?? DEFAULT_HISTORY_LIMIT;
        const offset = input.offset ?? 0;

        const rows = await db
            .select({
                id: entityChangeHistory.id,
                entityType: entityChangeHistory.entityType,
                entityId: entityChangeHistory.entityId,
                eventType: entityChangeHistory.eventType,
                fieldName: entityChangeHistory.fieldName,
                previousValue: entityChangeHistory.previousValue,
                newValue: entityChangeHistory.newValue,
                changedAt: entityChangeHistory.changedAt,
                source: entityChangeHistory.source,
            })
            .from(entityChangeHistory)
            .where(
                and(
                    eq(entityChangeHistory.accountId, input.config.accountId),
                    eq(entityChangeHistory.entityType, input.entityType),
                    eq(entityChangeHistory.entityId, input.entityId),
                    gte(entityChangeHistory.localDate, range.startDate),
                    lte(entityChangeHistory.localDate, range.endDate),
                    ...(countryCode ? [eq(entityChangeHistory.countryCode, countryCode)] : [])
                )
            )
            .orderBy(desc(entityChangeHistory.changedAt), desc(entityChangeHistory.createdAt), desc(entityChangeHistory.id))
            .limit(limit)
            .offset(offset);

        return {
            items: rows.map(row => ({
                id: row.id,
                entityType: input.entityType,
                entityId: row.entityId,
                eventType: row.eventType as 'bid_change' | 'state_change' | 'budget_change',
                fieldName: row.fieldName,
                previousValue: row.previousValue,
                newValue: row.newValue,
                changedAt: row.changedAt.toISOString(),
                source: row.source as 'bidbeacon' | 'ams' | 'change_history',
            })),
        };
    });

const normalizeCountryCode = (value: string | undefined) => {
    const trimmed = value?.trim().toUpperCase();
    return trimmed ? trimmed : undefined;
};

const resolveRangeOverride = (defaultRange: string, override?: string) => {
    const normalized = override?.trim();
    return normalized ? normalized : defaultRange;
};

const parseHistoryRange = (range: string, timezone: string) => {
    const normalized = range.trim().toLowerCase();
    if (normalized === 'today' || normalized === 't') {
        const zonedNow = toZonedTime(new Date(), timezone);
        const dateValue = format(zonedNow, 'yyyy-MM-dd');
        return { startDate: dateValue, endDate: dateValue };
    }
    if (normalized === 'yesterday' || normalized === 'y') {
        const zonedNow = toZonedTime(new Date(), timezone);
        const dateValue = format(addDays(startOfDay(zonedNow), -1), 'yyyy-MM-dd');
        return { startDate: dateValue, endDate: dateValue };
    }
    if (normalized === 'week' || normalized === 'w') {
        return parseHistoryRange('7d', timezone);
    }
    if (normalized === 'month' || normalized === 'm') {
        return parseHistoryRange('30d', timezone);
    }
    if (range.includes('..')) {
        const [start, end] = range.split('..');
        const startDate = normalizeDate(start);
        const endDate = normalizeDate(end);
        return { startDate, endDate };
    }

    const match = range.trim().match(DAYS_RANGE_REGEX);
    if (!match) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid range format.' });
    }

    const days = Number(match[1]);
    if (!Number.isFinite(days) || days <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid range days.' });
    }

    const zonedNow = toZonedTime(new Date(), timezone);
    const endDate = format(zonedNow, 'yyyy-MM-dd');
    const startDateValue = addDays(startOfDay(zonedNow), -(days - 1));
    const startDate = format(startDateValue, 'yyyy-MM-dd');
    return { startDate, endDate };
};

const normalizeDate = (value: string) => {
    const trimmed = value.trim();
    const parts = trimmed.split('-');
    if (parts.length !== 3) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid date range format.' });
    }
    return trimmed;
};

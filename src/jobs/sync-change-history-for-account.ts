import { addDays, subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { and, eq, gte, type InferInsertModel, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { ApiRegion } from '@/amazon-ads/config';
import { type ChangeHistoryEvent, DEFAULT_CHANGE_HISTORY_EVENT_TYPES, getChangeHistory } from '@/amazon-ads/get-change-history';
import { db } from '@/db/index';
import { advertiserAccount, changeHistorySyncState, entityChangeHistory } from '@/db/schema';
import { gateAccountWork } from '@/jobs/account-access-gate';
import { boss } from '@/jobs/boss';
import { zonedNow, zonedStartOfDay, zonedSubtractDays } from '@/utils/date';
import { type JobMetricsRecorder, withJobMetrics } from '@/utils/job-metrics';
import { getTimezoneForCountry } from '@/utils/timezones';

const CHANGE_HISTORY_LOOKBACK_DAYS = 89;
const CHANGE_HISTORY_PAGE_SIZE = 200;
const TIMESTAMP_SECONDS_THRESHOLD = 1_000_000_000_000;
const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

type ChangeHistoryEntityType = InferInsertModel<typeof entityChangeHistory>['entityType'];
type ChangeHistoryEventType = InferInsertModel<typeof entityChangeHistory>['eventType'];
type DayReconcileResult = {
    deletedCount: number;
    insertedCount: number;
};

type NormalizedHistoryChange = {
    localDate: string;
    row: InferInsertModel<typeof entityChangeHistory>;
};

const NA_COUNTRIES = new Set(['US', 'CA', 'MX', 'BR']);
const EU_COUNTRIES = new Set(['GB', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'PL', 'TR', 'AE', 'SA', 'EG']);
const FE_COUNTRIES = new Set(['JP', 'AU', 'IN', 'SG']);

export const syncChangeHistoryForAccountJob = boss
    .createJob('sync-change-history-for-account')
    .input(jobInputSchema)
    .retry({
        limit: 2,
        delay: 30,
        backoff: true,
    })
    .debounce({
        seconds: 20 * 60,
        key: data => `${data.accountId}:${data.countryCode}`,
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'sync-change-history-for-account',
                        bossJobId: job.id,
                        input: job.data,
                        accountId: job.data.accountId,
                        countryCode: job.data.countryCode,
                    },
                    async recorder => {
                        if (!(await gateAccountWork({ accountId: job.data.accountId, countryCode: job.data.countryCode, recorder }))) {
                            return;
                        }
                        return syncChangeHistoryForAccount(job.data.accountId, job.data.countryCode, recorder);
                    }
                )
            )
        );
    });

const syncChangeHistoryForAccount = async (accountId: string, countryCode: string, recorder: JobMetricsRecorder) => {
    const [account] = await db
        .select({ profileId: advertiserAccount.profileId })
        .from(advertiserAccount)
        .where(and(eq(advertiserAccount.adsAccountId, accountId), eq(advertiserAccount.countryCode, countryCode), eq(advertiserAccount.enabled, true)))
        .limit(1);

    if (!account?.profileId) {
        recorder.addEvent({
            message: 'Skipped change-history sync (missing profile id).',
            payload: {
                accountId,
                countryCode,
                reason: 'missing-profile-id',
            },
        });
        return;
    }

    const profileId = Number(account.profileId);
    if (!Number.isFinite(profileId)) {
        recorder.addEvent({
            message: 'Skipped change-history sync (invalid profile id).',
            payload: {
                accountId,
                countryCode,
                profileId: account.profileId,
                reason: 'invalid-profile-id',
            },
        });
        return;
    }

    const timezone = getTimezoneForCountry(countryCode);
    const now = zonedNow(timezone);
    const todayStart = zonedStartOfDay(now, timezone);

    const todayLocalDate = formatInTimeZone(todayStart, timezone, 'yyyy-MM-dd');
    const yesterdayStart = subDays(todayStart, 1);
    const yesterdayLocalDate = formatInTimeZone(yesterdayStart, timezone, 'yyyy-MM-dd');

    const windowStart = zonedSubtractDays(todayStart, CHANGE_HISTORY_LOOKBACK_DAYS, timezone);
    const windowStartLocalDate = formatInTimeZone(windowStart, timezone, 'yyyy-MM-dd');

    const syncRows = await db
        .select({
            localDate: changeHistorySyncState.localDate,
            reconciledAt: changeHistorySyncState.reconciledAt,
        })
        .from(changeHistorySyncState)
        .where(
            and(
                eq(changeHistorySyncState.accountId, accountId),
                eq(changeHistorySyncState.countryCode, countryCode),
                gte(changeHistorySyncState.localDate, windowStartLocalDate),
                lte(changeHistorySyncState.localDate, yesterdayLocalDate)
            )
        );

    const reconciledMap = new Map<string, Date>();
    for (const row of syncRows) {
        reconciledMap.set(toLocalDateString(row.localDate), row.reconciledAt);
    }

    const allWindowDates = enumerateLocalDates(windowStartLocalDate, yesterdayLocalDate);
    const earliestMissingLocalDate = allWindowDates.find(localDate => !reconciledMap.has(localDate));
    const yesterdayReconciledAt = reconciledMap.get(yesterdayLocalDate);
    const shouldRefreshYesterday = !yesterdayReconciledAt || yesterdayReconciledAt.getTime() < todayStart.getTime();

    const syncPlan = resolveSyncPlan({
        earliestMissingLocalDate,
        shouldRefreshYesterday,
        todayLocalDate,
        yesterdayLocalDate,
    });

    if (!syncPlan) {
        recorder.addEvent({
            message: 'Change-history sync is already up to date.',
            payload: {
                accountId,
                countryCode,
                windowStartLocalDate,
                yesterdayLocalDate,
            },
        });
        return;
    }

    const fromDate = localDateStartToEpochMs(syncPlan.fromLocalDate, timezone);
    const toDate = localDateStartToEpochMs(syncPlan.toLocalDateExclusive, timezone);
    const region = resolveApiRegion(countryCode);

    const rawEvents = await fetchAllChangeHistoryEvents({
        profileId,
        fromDate,
        toDate,
        region,
    });

    const reconcileDates = enumerateLocalDates(syncPlan.fromLocalDate, previousLocalDate(syncPlan.toLocalDateExclusive));
    const reconcileDateSet = new Set(reconcileDates);
    const rowsByLocalDate = new Map<string, InferInsertModel<typeof entityChangeHistory>[]>();

    let ignoredEvents = 0;
    for (const event of rawEvents) {
        const normalized = mapHistoryEvent({
            event,
            accountId,
            countryCode,
            timezone,
        });

        if (!(normalized && reconcileDateSet.has(normalized.localDate))) {
            ignoredEvents += 1;
            continue;
        }

        const existing = rowsByLocalDate.get(normalized.localDate);
        if (existing) {
            existing.push(normalized.row);
            continue;
        }

        rowsByLocalDate.set(normalized.localDate, [normalized.row]);
    }

    let totalDeletedCount = 0;
    let totalInsertedCount = 0;
    for (const localDate of reconcileDates) {
        const rows = rowsByLocalDate.get(localDate) ?? [];
        const result = await reconcileLocalDate({
            accountId,
            countryCode,
            localDate,
            rows,
        });
        totalDeletedCount += result.deletedCount;
        totalInsertedCount += result.insertedCount;
    }

    recorder.addEvent({
        message: 'Reconciled change-history rows from Amazon.',
        payload: {
            accountId,
            countryCode,
            mode: syncPlan.mode,
            fromLocalDate: syncPlan.fromLocalDate,
            toLocalDateExclusive: syncPlan.toLocalDateExclusive,
            daysReconciled: reconcileDates.length,
            fetchedEvents: rawEvents.length,
            ignoredEvents,
            deletedRows: totalDeletedCount,
            insertedRows: totalInsertedCount,
        },
    });
};

const resolveSyncPlan = (args: {
    earliestMissingLocalDate: string | undefined;
    shouldRefreshYesterday: boolean;
    todayLocalDate: string;
    yesterdayLocalDate: string;
}): { mode: 'backfill' | 'daily-refresh'; fromLocalDate: string; toLocalDateExclusive: string } | null => {
    if (args.earliestMissingLocalDate) {
        return {
            mode: 'backfill',
            fromLocalDate: args.earliestMissingLocalDate,
            toLocalDateExclusive: args.todayLocalDate,
        };
    }

    if (args.shouldRefreshYesterday) {
        return {
            mode: 'daily-refresh',
            fromLocalDate: args.yesterdayLocalDate,
            toLocalDateExclusive: args.todayLocalDate,
        };
    }

    return null;
};

const fetchAllChangeHistoryEvents = async (args: { profileId: number; fromDate: number; toDate: number; region: ApiRegion }) => {
    const events: ChangeHistoryEvent[] = [];
    const seenTokens = new Set<string>();

    let nextToken: string | undefined;
    while (true) {
        const response = await getChangeHistory(
            {
                profileId: args.profileId,
                fromDate: args.fromDate,
                toDate: args.toDate,
                nextToken,
                count: CHANGE_HISTORY_PAGE_SIZE,
                eventTypes: DEFAULT_CHANGE_HISTORY_EVENT_TYPES,
            },
            args.region
        );

        events.push(...response.events);

        if (!response.nextToken) {
            break;
        }

        if (seenTokens.has(response.nextToken)) {
            throw new Error('Change-history pagination repeated nextToken.');
        }

        seenTokens.add(response.nextToken);
        nextToken = response.nextToken;
    }

    return events;
};

const mapHistoryEvent = (args: { event: ChangeHistoryEvent; accountId: string; countryCode: string; timezone: string }): NormalizedHistoryChange | null => {
    const entityType = mapEntityType(args.event.entityType);
    const eventMapping = mapEventType(args.event.entityType, args.event.changeType);

    if (!(entityType && eventMapping)) {
        return null;
    }

    const changedAt = toChangedAt(args.event.timestamp);
    const localDate = formatInTimeZone(changedAt, args.timezone, 'yyyy-MM-dd');

    const previousValue = normalizeHistoryValue(args.event.previousValue);
    const newValue = normalizeHistoryValue(args.event.newValue);

    if (previousValue === newValue) {
        return null;
    }

    return {
        localDate,
        row: {
            accountId: args.accountId,
            countryCode: args.countryCode,
            localDate,
            entityType,
            entityId: String(args.event.entityId),
            eventType: eventMapping.eventType,
            fieldName: eventMapping.fieldName,
            previousValue,
            newValue,
            changedAt,
            source: 'change_history',
            rawPayload: args.event,
        },
    };
};

const mapEntityType = (entityType: string): ChangeHistoryEntityType | null => {
    if (entityType === 'CAMPAIGN') {
        return 'campaign';
    }
    if (entityType === 'AD_GROUP') {
        return 'adGroup';
    }
    if (entityType === 'AD') {
        return 'ad';
    }
    if (entityType === 'KEYWORD' || entityType === 'PRODUCT_TARGETING' || entityType === 'NEGATIVE_KEYWORD' || entityType === 'THEME') {
        return 'target';
    }
    return null;
};

const mapEventType = (entityType: string, changeType: string): { eventType: ChangeHistoryEventType; fieldName: string } | null => {
    if (changeType === 'STATUS') {
        return { eventType: 'state_change', fieldName: 'state' };
    }

    if (entityType === 'CAMPAIGN' && changeType === 'BUDGET_AMOUNT') {
        return { eventType: 'budget_change', fieldName: 'budgetAmount' };
    }

    if (entityType === 'AD_GROUP' && (changeType === 'BID_AMOUNT' || changeType === 'DEFAULT_BID_AMOUNT')) {
        return { eventType: 'bid_change', fieldName: 'bidAmount' };
    }

    if ((entityType === 'KEYWORD' || entityType === 'PRODUCT_TARGETING') && changeType === 'BID_AMOUNT') {
        return { eventType: 'bid_change', fieldName: 'bidAmount' };
    }

    return null;
};

const reconcileLocalDate = async (args: { accountId: string; countryCode: string; localDate: string; rows: InferInsertModel<typeof entityChangeHistory>[] }): Promise<DayReconcileResult> => {
    return db.transaction(async tx => {
        const deletedRows = await tx
            .delete(entityChangeHistory)
            .where(and(eq(entityChangeHistory.accountId, args.accountId), eq(entityChangeHistory.countryCode, args.countryCode), eq(entityChangeHistory.localDate, args.localDate)))
            .returning({ id: entityChangeHistory.id });

        if (args.rows.length > 0) {
            await tx
                .insert(entityChangeHistory)
                .values(args.rows)
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
        }

        await tx
            .insert(changeHistorySyncState)
            .values({
                accountId: args.accountId,
                countryCode: args.countryCode,
                localDate: args.localDate,
                reconciledAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [changeHistorySyncState.accountId, changeHistorySyncState.countryCode, changeHistorySyncState.localDate],
                set: {
                    reconciledAt: new Date(),
                },
            });

        return {
            deletedCount: deletedRows.length,
            insertedCount: args.rows.length,
        };
    });
};

const localDateStartToEpochMs = (localDate: string, timezone: string) => {
    const start = fromZonedTime(`${localDate}T00:00:00`, timezone);
    return start.getTime();
};

const previousLocalDate = (localDate: string) => {
    const date = new Date(`${localDate}T00:00:00Z`);
    return formatInTimeZone(subDays(date, 1), 'UTC', 'yyyy-MM-dd');
};

const toChangedAt = (timestamp: number) => {
    if (timestamp > TIMESTAMP_SECONDS_THRESHOLD) {
        return new Date(timestamp);
    }
    return new Date(timestamp * 1000);
};

const normalizeHistoryValue = (value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) {
        return null;
    }
    return String(value);
};

const enumerateLocalDates = (startLocalDate: string, endLocalDateInclusive: string) => {
    const startDate = new Date(`${startLocalDate}T00:00:00Z`);
    const endDate = new Date(`${endLocalDateInclusive}T00:00:00Z`);

    const dates: string[] = [];
    for (let cursor = startDate; cursor.getTime() <= endDate.getTime(); cursor = addDays(cursor, 1)) {
        dates.push(formatInTimeZone(cursor, 'UTC', 'yyyy-MM-dd'));
    }

    return dates;
};

const toLocalDateString = (value: string | Date) => {
    if (typeof value === 'string') {
        return value;
    }
    return formatInTimeZone(value, 'UTC', 'yyyy-MM-dd');
};

const resolveApiRegion = (countryCode: string): ApiRegion => {
    const code = countryCode.toUpperCase();

    if (NA_COUNTRIES.has(code)) {
        return 'na';
    }
    if (EU_COUNTRIES.has(code)) {
        return 'eu';
    }
    if (FE_COUNTRIES.has(code)) {
        return 'fe';
    }

    return 'na';
};

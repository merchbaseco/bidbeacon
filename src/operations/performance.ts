import { addDays, addHours } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, type SQLWrapper, sql } from 'drizzle-orm';
import { ad, campaign, performanceDaily, performanceHourly } from '@/db/schema';
import { getAdvertiserAccountMetadata } from '@/utils/advertiser-account-metadata';
import { resolveAdvertiserAccount } from './advertiser-accounts';
import type { OperationContext } from './operation-context';
import { OperationError } from './operation-errors';
import { type PerformanceInput, type PerformanceInterval, type PerformanceMetric, performanceInputSchema, performanceOutputSchema } from './performance-schemas';
import { queryPerformanceCoverage } from './search-coverage';
import { buildSearchMetricValues, emptySearchMetrics, type SearchMetricTotals } from './search-metrics';

const MAX_ACCOUNT_DAYS = 400;
const MAX_ACCOUNT_HOURS_DAYS = 7;
const MAX_ACCOUNT_MONTHS = 60;
const MAX_POINTS = 5000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const EXECUTION_TIMEOUT_MS = 10_000;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CALENDAR_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

export type PerformanceExecutionOptions = {
    beforeQuery?: () => Promise<void>;
    maxResponseBytes?: number;
    timeoutMs?: number;
};

type DateRange = { startDate: string; endDate: string };
type Bucket = { key: string; point: Record<string, string> };
type MetricRow = SearchMetricTotals & {
    bucket: string | Date;
    entityId?: string;
    impressionDays?: number | string | null;
    firstImpressionDate?: string | Date | null;
    lastImpressionDate?: string | Date | null;
};
type SeriesWindow = {
    totals: Record<string, number | null>;
    points: Record<string, unknown>[];
    activity: { impressionDays: number; firstImpressionDate: string | null; lastImpressionDate: string | null };
};
type EntityColumn = 'ad' | 'target' | 'campaign';

export const performance = async (context: OperationContext, input: unknown, options: PerformanceExecutionOptions = {}) => {
    const parsed = performanceInputSchema.safeParse(input);
    if (!parsed.success) {
        throw new OperationError('INVALID_INPUT', 'Performance input is invalid.', { issues: parsed.error.issues });
    }
    validatePerformanceInput(parsed.data);

    const account = await resolveAdvertiserAccount(context, { accountId: parsed.data.accountId });
    const metadata = getAdvertiserAccountMetadata(account.countryCode);
    const buckets = buildBuckets(parsed.data.interval, parsed.data.dateRange, metadata.timezone);
    const comparisonRange = parsed.data.comparisonDateRange;
    const comparisonBuckets = comparisonRange ? buildBuckets(parsed.data.interval, comparisonRange, metadata.timezone) : [];
    const entityCount = parsed.data.dimension === 'account' ? 1 : getEntityIds(parsed.data).length;
    const estimatedPoints = entityCount * (buckets.length + comparisonBuckets.length);
    if (estimatedPoints > MAX_POINTS) {
        throw resultTooLarge(parsed.data, estimatedPoints, MAX_POINTS);
    }

    const execute = async () => {
        await options.beforeQuery?.();
        const timeoutMs = options.timeoutMs ?? EXECUTION_TIMEOUT_MS;
        const aggregation = parsed.data.interval === 'hour' ? 'hourly' : 'daily';
        const comparisonInput = comparisonRange ? { ...parsed.data, dateRange: comparisonRange } : undefined;
        const read = <T>(run: (db: OperationContext['db']) => Promise<T>) => withStatementTimeout(context.db, timeoutMs, run);
        const [rows, coverage, comparisonRows, comparisonCoverage] = await Promise.all([
            read(db => queryPerformanceRows({ ...context, db }, account, parsed.data, metadata.timezone)),
            read(db => queryPerformanceCoverage({ ...context, db }, account, parsed.data.dateRange, metadata.timezone, aggregation)),
            comparisonInput ? read(db => queryPerformanceRows({ ...context, db }, account, comparisonInput, metadata.timezone)) : undefined,
            comparisonInput ? read(db => queryPerformanceCoverage({ ...context, db }, account, comparisonInput.dateRange, metadata.timezone, aggregation)) : undefined,
        ]).catch(error => {
            if (isStatementTimeout(error)) {
                throw new OperationError('EXECUTION_TIMEOUT', 'Performance execution exceeded the server time limit.', {
                    timeoutMs,
                    suggestions: ['Use a coarser interval or shorter date range.'],
                });
            }
            throw error;
        });
        const result = buildResult(parsed.data, rows, buckets, coverage, comparisonRows, comparisonBuckets, comparisonCoverage, metadata.timezone, {
            id: account.id,
            timezone: metadata.timezone,
            currency: metadata.currency,
        });
        const responseBytes = Buffer.byteLength(JSON.stringify(result));
        const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
        if (responseBytes > maxResponseBytes) {
            throw new OperationError('RESPONSE_TOO_LARGE', 'Performance result exceeds the response-size limit.', {
                responseBytes,
                maxResponseBytes,
                suggestions: responseNarrowingSuggestions(parsed.data),
            });
        }
        return performanceOutputSchema.parse(result);
    };

    return withExecutionTimeout(execute(), options.timeoutMs ?? EXECUTION_TIMEOUT_MS);
};

const validatePerformanceInput = (input: PerformanceInput) => {
    assertDateRange(input.dateRange);
    if (input.comparisonDateRange) {
        assertDateRange(input.comparisonDateRange);
    }
    if (new Set(input.metrics).size !== input.metrics.length) {
        throw new OperationError('INVALID_INPUT', 'Performance metrics must be unique.');
    }
    if (input.dimension !== 'account') {
        if (!input.entityIds) {
            throw new OperationError('INVALID_INPUT', `${dimensionLabel(input)} Performance requires entityIds.`);
        }
        const normalizedIds = getEntityIds(input);
        if (new Set(normalizedIds).size !== normalizedIds.length) {
            throw new OperationError('INVALID_INPUT', `Performance ${dimensionLabel(input)} entityIds must be unique.`, { entityIds: input.entityIds });
        }
    } else if (input.entityIds) {
        throw new OperationError('INVALID_INPUT', 'Account Performance does not accept entityIds.');
    }

    assertRangeWithinIntervalCap(input, input.dateRange);
    if (input.comparisonDateRange) {
        assertRangeWithinIntervalCap(input, input.comparisonDateRange);
    }
};

const assertDateRange = (dateRange: DateRange) => {
    if (!(isIsoDate(dateRange.startDate) && isIsoDate(dateRange.endDate)) || dateRange.startDate > dateRange.endDate) {
        throw new OperationError('INVALID_INPUT', 'Performance dates must be valid inclusive YYYY-MM-DD dates with startDate on or before endDate.');
    }
};

const assertRangeWithinIntervalCap = (input: PerformanceInput, dateRange: DateRange) => {
    const start = new Date(`${dateRange.startDate}T00:00:00.000Z`);
    const end = new Date(`${dateRange.endDate}T00:00:00.000Z`);
    const requestedDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const requestedMonths = monthIndex(dateRange.endDate) - monthIndex(dateRange.startDate) + 1;
    const maxRange = input.interval === 'hour' ? MAX_ACCOUNT_HOURS_DAYS : input.interval === 'day' ? MAX_ACCOUNT_DAYS : MAX_ACCOUNT_MONTHS;
    const requestedRange = input.interval === 'month' ? requestedMonths : requestedDays;
    if (requestedRange > maxRange) {
        const entityCount = input.dimension === 'account' ? 1 : getEntityIds(input).length;
        const pointsPerRangeUnit = input.interval === 'hour' ? 24 : 1;
        throw resultTooLarge(input, requestedRange * pointsPerRangeUnit * entityCount, Math.min(maxRange * pointsPerRangeUnit * entityCount, MAX_POINTS), {
            requestedRange,
            maxRange,
            rangeUnit: input.interval === 'month' ? 'months' : 'days',
        });
    }
};

const queryPerformanceRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, input: PerformanceInput, timezone: string): Promise<MetricRow[]> => {
    if (input.interval === 'month') {
        return queryMonthlyRows(context, account, input);
    }
    if (input.interval === 'hour') {
        const start = fromZonedTime(`${input.dateRange.startDate}T00:00:00`, timezone);
        const endExclusive = fromZonedTime(`${nextDate(input.dateRange.endDate)}T00:00:00`, timezone);
        const conditions = [
            eq(performanceHourly.accountId, account.adsAccountId),
            eq(performanceHourly.entityType, 'target'),
            gte(performanceHourly.bucketStart, start),
            lt(performanceHourly.bucketStart, endExclusive),
        ];
        if (input.dimension === 'account') {
            return context.db
                .select({ bucket: performanceHourly.bucketStart, ...metricSelect(performanceHourly) })
                .from(performanceHourly)
                .where(and(...conditions))
                .groupBy(performanceHourly.bucketStart)
                .orderBy(asc(performanceHourly.bucketStart)) as Promise<MetricRow[]>;
        }
        if (input.dimension !== 'product') {
            const entityColumn = performanceEntityColumn(input.dimension, performanceHourly);
            return context.db
                .select({ entityId: entityColumn, bucket: performanceHourly.bucketStart, ...metricSelect(performanceHourly) })
                .from(performanceHourly)
                .where(and(...conditions, inArray(entityColumn, getEntityIds(input))))
                .groupBy(entityColumn, performanceHourly.bucketStart)
                .orderBy(asc(entityColumn), asc(performanceHourly.bucketStart)) as Promise<MetricRow[]>;
        }
        return context.db
            .select({ entityId: sql<string>`${ad.productAsin}`.as('entity_id'), bucket: performanceHourly.bucketStart, ...metricSelect(performanceHourly) })
            .from(performanceHourly)
            .innerJoin(ad, and(eq(ad.adId, performanceHourly.adId), eq(ad.campaignId, performanceHourly.campaignId), eq(ad.adProduct, 'SPONSORED_PRODUCTS')))
            .innerJoin(
                campaign,
                and(
                    eq(campaign.campaignId, performanceHourly.campaignId),
                    eq(campaign.accountId, account.adsAccountId),
                    eq(campaign.countryCode, account.countryCode),
                    eq(campaign.adProduct, 'SPONSORED_PRODUCTS')
                )
            )
            .where(and(...conditions, isNotNull(ad.productAsin), inArray(ad.productAsin, getEntityIds(input))))
            .groupBy(ad.productAsin, performanceHourly.bucketStart)
            .orderBy(asc(ad.productAsin), asc(performanceHourly.bucketStart)) as Promise<MetricRow[]>;
    }

    const bucket = performanceDaily.bucketDate;
    const conditions = [
        eq(performanceDaily.accountId, account.adsAccountId),
        eq(performanceDaily.entityType, 'target'),
        gte(performanceDaily.bucketDate, input.dateRange.startDate),
        lte(performanceDaily.bucketDate, input.dateRange.endDate),
    ];
    if (input.dimension === 'account') {
        return context.db
            .select({ bucket, ...metricSelect(performanceDaily) })
            .from(performanceDaily)
            .where(and(...conditions))
            .groupBy(bucket)
            .orderBy(asc(bucket)) as Promise<MetricRow[]>;
    }
    if (input.dimension !== 'product') {
        const entityColumn = performanceEntityColumn(input.dimension, performanceDaily);
        return context.db
            .select({ entityId: entityColumn, bucket, ...metricSelect(performanceDaily) })
            .from(performanceDaily)
            .where(and(...conditions, inArray(entityColumn, getEntityIds(input))))
            .groupBy(entityColumn, bucket)
            .orderBy(asc(entityColumn), asc(bucket)) as Promise<MetricRow[]>;
    }
    return context.db
        .select({ entityId: sql<string>`${ad.productAsin}`.as('entity_id'), bucket, ...metricSelect(performanceDaily) })
        .from(performanceDaily)
        .innerJoin(ad, and(eq(ad.adId, performanceDaily.adId), eq(ad.campaignId, performanceDaily.campaignId), eq(ad.adProduct, 'SPONSORED_PRODUCTS')))
        .innerJoin(
            campaign,
            and(
                eq(campaign.campaignId, performanceDaily.campaignId),
                eq(campaign.accountId, account.adsAccountId),
                eq(campaign.countryCode, account.countryCode),
                eq(campaign.adProduct, 'SPONSORED_PRODUCTS')
            )
        )
        .where(and(...conditions, isNotNull(ad.productAsin), inArray(ad.productAsin, getEntityIds(input))))
        .groupBy(ad.productAsin, bucket)
        .orderBy(asc(ad.productAsin), asc(bucket)) as Promise<MetricRow[]>;
};

const metricSelect = (table: typeof performanceDaily | typeof performanceHourly) => ({
    impressions: sql<number>`coalesce(sum(${table.impressions}), 0)`.as('impressions'),
    clicks: sql<number>`coalesce(sum(${table.clicks}), 0)`.as('clicks'),
    spend: sql<number>`coalesce(sum(${table.spend}), 0)`.as('spend'),
    orders: sql<number>`coalesce(sum(${table.purchases}), 0)`.as('orders'),
    sales: sql<number>`coalesce(sum(${table.sales}), 0)`.as('sales'),
});

const queryMonthlyRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, input: PerformanceInput): Promise<MetricRow[]> => {
    const conditions = [
        eq(performanceDaily.accountId, account.adsAccountId),
        eq(performanceDaily.entityType, 'target'),
        gte(performanceDaily.bucketDate, input.dateRange.startDate),
        lte(performanceDaily.bucketDate, input.dateRange.endDate),
    ];
    const dayMetrics = {
        bucketDate: performanceDaily.bucketDate,
        impressions: sql<number>`sum(${performanceDaily.impressions})`.as('impressions'),
        clicks: sql<number>`sum(${performanceDaily.clicks})`.as('clicks'),
        spend: sql<number>`sum(${performanceDaily.spend})`.as('spend'),
        orders: sql<number>`sum(${performanceDaily.purchases})`.as('orders'),
        sales: sql<number>`sum(${performanceDaily.sales})`.as('sales'),
    };

    if (input.dimension === 'account') {
        const days = context.db
            .select(dayMetrics)
            .from(performanceDaily)
            .where(and(...conditions))
            .groupBy(performanceDaily.bucketDate)
            .as('performance_days');
        return context.db
            .select({ bucket: monthOf(days.bucketDate), ...monthMetricSelect(days) })
            .from(days)
            .groupBy(monthOf(days.bucketDate))
            .orderBy(asc(monthOf(days.bucketDate))) as Promise<MetricRow[]>;
    }

    if (input.dimension === 'product') {
        const days = context.db
            .select({ entityId: ad.productAsin, ...dayMetrics })
            .from(performanceDaily)
            .innerJoin(ad, and(eq(ad.adId, performanceDaily.adId), eq(ad.campaignId, performanceDaily.campaignId), eq(ad.adProduct, 'SPONSORED_PRODUCTS')))
            .innerJoin(
                campaign,
                and(
                    eq(campaign.campaignId, performanceDaily.campaignId),
                    eq(campaign.accountId, account.adsAccountId),
                    eq(campaign.countryCode, account.countryCode),
                    eq(campaign.adProduct, 'SPONSORED_PRODUCTS')
                )
            )
            .where(and(...conditions, isNotNull(ad.productAsin), inArray(ad.productAsin, getEntityIds(input))))
            .groupBy(ad.productAsin, performanceDaily.bucketDate)
            .as('performance_days');
        return context.db
            .select({ entityId: days.entityId, bucket: monthOf(days.bucketDate), ...monthMetricSelect(days) })
            .from(days)
            .groupBy(days.entityId, monthOf(days.bucketDate))
            .orderBy(asc(days.entityId), asc(monthOf(days.bucketDate))) as Promise<MetricRow[]>;
    }

    const entityColumn = performanceEntityColumn(input.dimension, performanceDaily);
    const days = context.db
        .select({ entityId: entityColumn, ...dayMetrics })
        .from(performanceDaily)
        .where(and(...conditions, inArray(entityColumn, getEntityIds(input))))
        .groupBy(entityColumn, performanceDaily.bucketDate)
        .as('performance_days');
    return context.db
        .select({ entityId: days.entityId, bucket: monthOf(days.bucketDate), ...monthMetricSelect(days) })
        .from(days)
        .groupBy(days.entityId, monthOf(days.bucketDate))
        .orderBy(asc(days.entityId), asc(monthOf(days.bucketDate))) as Promise<MetricRow[]>;
};

const monthOf = (bucketDate: SQLWrapper) => sql<string>`substring(${bucketDate}::text, 1, 7)`;

const monthMetricSelect = (days: { impressions: SQLWrapper; clicks: SQLWrapper; spend: SQLWrapper; orders: SQLWrapper; sales: SQLWrapper; bucketDate: SQLWrapper }) => ({
    impressions: sql<number>`coalesce(sum(${days.impressions}), 0)`.as('impressions'),
    clicks: sql<number>`coalesce(sum(${days.clicks}), 0)`.as('clicks'),
    spend: sql<number>`coalesce(sum(${days.spend}), 0)`.as('spend'),
    orders: sql<number>`coalesce(sum(${days.orders}), 0)`.as('orders'),
    sales: sql<number>`coalesce(sum(${days.sales}), 0)`.as('sales'),
    impressionDays: sql<number>`count(*) filter (where ${days.impressions} > 0)`.as('impression_days'),
    firstImpressionDate: sql<string | null>`min(${days.bucketDate}) filter (where ${days.impressions} > 0)`.as('first_impression_date'),
    lastImpressionDate: sql<string | null>`max(${days.bucketDate}) filter (where ${days.impressions} > 0)`.as('last_impression_date'),
});

const buildResult = (
    input: PerformanceInput,
    rows: MetricRow[],
    buckets: Bucket[],
    coverage: Awaited<ReturnType<typeof queryPerformanceCoverage>>,
    comparisonRows: MetricRow[] | undefined,
    comparisonBuckets: Bucket[],
    comparisonCoverage: Awaited<ReturnType<typeof queryPerformanceCoverage>> | undefined,
    timezone: string,
    account: { id: string; timezone: string; currency: string }
) => {
    const context = {
        account,
        dimension: input.dimension,
        interval: input.interval,
        metrics: input.metrics,
        dateRange: input.dateRange,
        coverage,
        ...(input.comparisonDateRange && comparisonCoverage ? { comparison: { dateRange: input.comparisonDateRange, coverage: comparisonCoverage } } : {}),
    };
    const comparisonInput = input.comparisonDateRange ? { ...input, dateRange: input.comparisonDateRange } : undefined;
    if (input.dimension === 'account') {
        return {
            context,
            ...buildSeriesValues(input, rows, buckets, timezone),
            ...(comparisonInput && comparisonRows ? { comparison: buildSeriesValues(comparisonInput, comparisonRows, comparisonBuckets, timezone) } : {}),
        };
    }
    const rowsByEntity = groupRowsByEntity(rows);
    const comparisonRowsByEntity = comparisonRows ? groupRowsByEntity(comparisonRows) : undefined;
    return {
        context,
        series: getEntityIds(input).map(entityId => ({
            entityId,
            ...buildSeriesValues(input, rowsByEntity.get(entityId) ?? [], buckets, timezone),
            ...(comparisonInput && comparisonRowsByEntity ? { comparison: buildSeriesValues(comparisonInput, comparisonRowsByEntity.get(entityId) ?? [], comparisonBuckets, timezone) } : {}),
        })),
    };
};

const buildSeriesValues = (input: PerformanceInput, rows: MetricRow[], buckets: Bucket[], timezone: string): SeriesWindow => {
    const rowsByBucket = new Map(rows.map(row => [bucketKey(row.bucket), row]));
    const totals = rows.reduce<SearchMetricTotals>(
        (sum, row) => ({
            impressions: sum.impressions + Number(row.impressions),
            clicks: sum.clicks + Number(row.clicks),
            spend: sum.spend + Number(row.spend),
            orders: sum.orders + Number(row.orders),
            sales: sum.sales + Number(row.sales),
        }),
        emptySearchMetrics()
    );
    return {
        totals: selectMetrics(input.metrics, totals),
        points: buckets.map(bucket => ({ ...bucket.point, metrics: selectMetrics(input.metrics, rowsByBucket.get(bucket.key) ?? emptySearchMetrics()) })),
        activity: buildActivity(input, rows, buckets, rowsByBucket, timezone),
    };
};

const buildActivity = (input: PerformanceInput, rows: MetricRow[], buckets: Bucket[], rowsByBucket: Map<string, MetricRow>, timezone: string) => {
    if (input.interval === 'month') {
        return activityFromMonthRows(rows);
    }
    if (input.interval === 'hour') {
        const impressionsByDate = new Map<string, number>();
        for (const bucket of buckets) {
            const date = formatInTimeZone(new Date(bucket.key), timezone, 'yyyy-MM-dd');
            impressionsByDate.set(date, (impressionsByDate.get(date) ?? 0) + Number(rowsByBucket.get(bucket.key)?.impressions ?? 0));
        }
        return activityFromDates([...impressionsByDate.entries()].filter(([, impressions]) => impressions > 0).map(([date]) => date));
    }
    return activityFromDates(buckets.filter(bucket => Number(rowsByBucket.get(bucket.key)?.impressions ?? 0) > 0).map(bucket => bucket.key));
};

const activityFromMonthRows = (rows: MetricRow[]) => {
    const impressionDays = rows.reduce((sum, row) => sum + Number(row.impressionDays ?? 0), 0);
    const dates = rows
        .flatMap(row => [calendarDate(row.firstImpressionDate), calendarDate(row.lastImpressionDate)])
        .filter(date => date !== null)
        .sort();
    return {
        impressionDays,
        firstImpressionDate: impressionDays === 0 ? null : (dates[0] ?? null),
        lastImpressionDate: impressionDays === 0 ? null : (dates.at(-1) ?? null),
    };
};

const activityFromDates = (dates: string[]) => {
    const ordered = [...dates].sort();
    return {
        impressionDays: ordered.length,
        firstImpressionDate: ordered[0] ?? null,
        lastImpressionDate: ordered.at(-1) ?? null,
    };
};

const calendarDate = (value: string | Date | null | undefined) => {
    if (value == null) {
        return null;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }
    const match = String(value).match(CALENDAR_DATE_PREFIX);
    return match?.[1] ?? null;
};

const selectMetrics = (metrics: PerformanceMetric[], totals: SearchMetricTotals) => {
    const values = buildSearchMetricValues({
        impressions: Number(totals.impressions),
        clicks: Number(totals.clicks),
        spend: Number(totals.spend),
        orders: Number(totals.orders),
        sales: Number(totals.sales),
    });
    return Object.fromEntries(metrics.map(metric => [metric, values[metric]]));
};

const buildBuckets = (interval: PerformanceInterval, dateRange: { startDate: string; endDate: string }, timezone: string) => {
    if (interval === 'hour') {
        const buckets: Array<{ key: string; point: Record<string, string> }> = [];
        let cursor = fromZonedTime(`${dateRange.startDate}T00:00:00`, timezone);
        const endExclusive = fromZonedTime(`${nextDate(dateRange.endDate)}T00:00:00`, timezone);
        while (cursor < endExclusive) {
            const end = addHours(cursor, 1);
            buckets.push({ key: cursor.toISOString(), point: { start: cursor.toISOString(), end: end.toISOString() } });
            cursor = end;
        }
        return buckets;
    }
    if (interval === 'day') {
        return dateSequence(dateRange.startDate, dateRange.endDate).map(date => ({ key: date, point: { date } }));
    }
    const buckets: Array<{ key: string; point: Record<string, string> }> = [];
    let cursor = monthIndex(dateRange.startDate);
    const end = monthIndex(dateRange.endDate);
    while (cursor <= end) {
        const month = formatMonthIndex(cursor);
        buckets.push({ key: month, point: { month } });
        cursor += 1;
    }
    return buckets;
};

const dateSequence = (startDate: string, endDate: string) => {
    const dates: string[] = [];
    let cursor = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (cursor <= end) {
        dates.push(formatInTimeZone(cursor, 'UTC', 'yyyy-MM-dd'));
        cursor = addDays(cursor, 1);
    }
    return dates;
};

const bucketKey = (bucket: string | Date) => (bucket instanceof Date ? bucket.toISOString() : bucket);

const nextDate = (date: string) =>
    addDays(new Date(`${date}T00:00:00.000Z`), 1)
        .toISOString()
        .slice(0, 10);

const monthIndex = (date: string) => {
    const [year, month] = date.split('-').map(Number);
    return year * 12 + month - 1;
};

const formatMonthIndex = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

const groupRowsByEntity = (rows: MetricRow[]) => {
    const grouped = new Map<string, MetricRow[]>();
    for (const row of rows) {
        const entityId = row.entityId ?? '';
        grouped.set(entityId, [...(grouped.get(entityId) ?? []), row]);
    }
    return grouped;
};

const resultTooLarge = (input: PerformanceInput, estimatedPoints: number, maxPoints: number, details: Record<string, unknown> = {}) =>
    new OperationError('RESULT_TOO_LARGE', 'Performance request exceeds the bounded result limits.', {
        estimatedPoints,
        maxPoints,
        dimensions: { dimension: input.dimension, interval: input.interval, entities: input.dimension === 'account' ? 1 : getEntityIds(input).length },
        suggestions: cardinalityNarrowingSuggestions(input),
        ...details,
    });

const responseNarrowingSuggestions = (input: PerformanceInput) => [
    ...(input.dimension === 'account' ? [] : [`Request fewer ${dimensionLabel(input)}s.`]),
    'Request fewer metrics.',
    'Use a coarser interval or shorter date range.',
];

const cardinalityNarrowingSuggestions = (input: PerformanceInput) => [
    ...(input.dimension === 'account' ? [] : [`Request fewer ${dimensionLabel(input)}s.`]),
    'Use a coarser interval or shorter date range.',
];

const performanceEntityColumn = (dimension: EntityColumn, table: typeof performanceDaily | typeof performanceHourly) => {
    switch (dimension) {
        case 'ad':
            return table.adId;
        case 'campaign':
            return table.campaignId;
        case 'target':
            return table.entityId;
        default: {
            const unreachable: never = dimension;
            return unreachable;
        }
    }
};

const isStatementTimeout = (error: unknown) => {
    const seen = new Set<unknown>();
    let current = error;
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        const record = current as { code?: unknown; message?: unknown; cause?: unknown };
        const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
        if (record.code === '57014' || message.includes('statement timeout')) {
            return true;
        }
        current = record.cause;
    }
    return false;
};

const withStatementTimeout = async <T>(db: OperationContext['db'], timeoutMs: number, run: (db: OperationContext['db']) => Promise<T>) =>
    db.transaction(async tx => {
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${Math.trunc(timeoutMs)}ms'`));
        return run(tx as OperationContext['db']);
    });

const withExecutionTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () =>
                        reject(
                            new OperationError('EXECUTION_TIMEOUT', 'Performance execution exceeded the server time limit.', {
                                timeoutMs,
                                suggestions: ['Use a coarser interval or shorter date range.'],
                            })
                        ),
                    timeoutMs
                );
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
};

const isIsoDate = (value: string) => {
    if (!ISO_DATE_REGEX.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const getEntityIds = (input: PerformanceInput) => (input.entityIds ?? []).map(entityId => (input.dimension === 'product' ? entityId.toUpperCase() : entityId));

const dimensionLabel = (input: PerformanceInput) => input.dimension[0]?.toUpperCase() + input.dimension.slice(1);

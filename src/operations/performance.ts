import { addDays, addHours } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
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

export type PerformanceExecutionOptions = {
    beforeQuery?: () => Promise<void>;
    maxResponseBytes?: number;
    timeoutMs?: number;
};

type MetricRow = SearchMetricTotals & { bucket: string | Date; entityId?: string };

export const performance = async (context: OperationContext, input: unknown, options: PerformanceExecutionOptions = {}) => {
    const parsed = performanceInputSchema.safeParse(input);
    if (!parsed.success) {
        throw new OperationError('INVALID_INPUT', 'Performance input is invalid.', { issues: parsed.error.issues });
    }
    validatePerformanceInput(parsed.data);

    const account = await resolveAdvertiserAccount(context, { accountId: parsed.data.accountId });
    const metadata = getAdvertiserAccountMetadata(account.countryCode);
    const buckets = buildBuckets(parsed.data.interval, parsed.data.dateRange, metadata.timezone);
    const entityCount = parsed.data.dimension === 'account' ? 1 : getEntityIds(parsed.data).length;
    const estimatedPoints = entityCount * buckets.length;
    if (estimatedPoints > MAX_POINTS) {
        throw resultTooLarge(parsed.data, estimatedPoints, MAX_POINTS);
    }

    const execute = async () => {
        await options.beforeQuery?.();
        const [rows, coverage] = await Promise.all([
            queryPerformanceRows(context, account, parsed.data, metadata.timezone),
            queryPerformanceCoverage(context, account, parsed.data.dateRange, metadata.timezone, parsed.data.interval === 'hour' ? 'hourly' : 'daily'),
        ]);
        const result = buildResult(parsed.data, rows, buckets, coverage, {
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
    const { startDate, endDate } = input.dateRange;
    if (!(isIsoDate(startDate) && isIsoDate(endDate)) || startDate > endDate) {
        throw new OperationError('INVALID_INPUT', 'Performance dates must be valid inclusive YYYY-MM-DD dates with startDate on or before endDate.');
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

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const requestedDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const requestedMonths = monthIndex(endDate) - monthIndex(startDate) + 1;
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
            const entityColumn = input.dimension === 'ad' ? performanceHourly.adId : performanceHourly.entityId;
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

    const bucket = input.interval === 'month' ? sql<string>`substring(${performanceDaily.bucketDate}::text, 1, 7)`.as('bucket') : performanceDaily.bucketDate;
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
        const entityColumn = input.dimension === 'ad' ? performanceDaily.adId : performanceDaily.entityId;
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

const buildResult = (
    input: PerformanceInput,
    rows: MetricRow[],
    buckets: Array<{ key: string; point: Record<string, string> }>,
    coverage: Awaited<ReturnType<typeof queryPerformanceCoverage>>,
    account: { id: string; timezone: string; currency: string }
) => {
    const context = { account, dimension: input.dimension, interval: input.interval, metrics: input.metrics, dateRange: input.dateRange, coverage };
    if (input.dimension === 'account') {
        return buildSeries(context, input.metrics, rows, buckets);
    }
    const rowsByEntity = groupRowsByEntity(rows);
    return {
        context,
        series: getEntityIds(input).map(entityId => ({ entityId, ...buildSeriesValues(input.metrics, rowsByEntity.get(entityId) ?? [], buckets) })),
    };
};

const buildSeries = (context: Record<string, unknown>, metrics: PerformanceMetric[], rows: MetricRow[], buckets: Array<{ key: string; point: Record<string, string> }>) => ({
    context,
    ...buildSeriesValues(metrics, rows, buckets),
});

const buildSeriesValues = (metrics: PerformanceMetric[], rows: MetricRow[], buckets: Array<{ key: string; point: Record<string, string> }>) => {
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
        totals: selectMetrics(metrics, totals),
        points: buckets.map(bucket => ({ ...bucket.point, metrics: selectMetrics(metrics, rowsByBucket.get(bucket.key) ?? emptySearchMetrics()) })),
    };
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

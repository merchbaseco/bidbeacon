import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { advertiserAccount, amsSpConversion, amsSpTraffic, jobMetrics, reportDatasetMetadata } from '@/db/schema';
import type { OperationDatabase } from '@/operations/operation-context';
import { getTimezoneForCountry } from '@/utils/timezones';
import { chooseDailyTargetSource, type DailyTargetSourceDecision, type FreshnessDate, getFreshnessDates, resolveStreamAsOf } from './source-precedence';

const STREAM_ROLLUP_JOB_NAME = 'summarize-hourly-target-stream-for-account';
// A rollup older than this cannot reach into any date in the freshness window.
const STREAM_ROLLUP_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

type Transaction = Parameters<Parameters<OperationDatabase['transaction']>[0]>[0];

export type DailyTargetRefreshResult = FreshnessDate & {
    decision: DailyTargetSourceDecision;
    outcome: 'derived-from-hourly' | 'kept-daily-report' | 'skipped-empty-hourly';
    rowsDerived: number;
    rowsChanged: number;
    rowsRemoved: number;
};

/**
 * Make `performance_daily` target rows for today and the two most recent closed dates reflect
 * the freshest source. When hourly data (Stream rollup or hourly-grain report) is newer than the
 * latest daily report for a date, the date's daily rows are replaced by the sum of its hourly
 * buckets in one transaction. Otherwise the daily report rows are left untouched.
 */
export const refreshDailyTargetPerformance = async (input: { database: OperationDatabase; accountId: string; countryCode: string; now?: Date }): Promise<DailyTargetRefreshResult[]> => {
    const now = input.now ?? new Date();
    const timezone = getTimezoneForCountry(input.countryCode);
    const streamRolledUpAt = await getStreamAsOf(input.database, input.accountId, input.countryCode, now);

    const results: DailyTargetRefreshResult[] = [];
    for (const period of getFreshnessDates(now, timezone)) {
        results.push(
            await input.database.transaction(tx =>
                refreshDate(tx, {
                    accountId: input.accountId,
                    countryCode: input.countryCode,
                    period,
                    streamRolledUpAt,
                    timezone,
                })
            )
        );
    }
    return results;
};

/**
 * Serialize writers of one account-local date in `performance_daily` (daily report parsing and
 * hourly derivation) so a derivation decided before a daily report landed cannot overwrite it.
 */
export const lockDailyTargetDate = async (tx: Pick<Transaction, 'execute'>, accountId: string, bucketDate: string) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`performance_daily:${accountId}:${bucketDate}`}, 0))`);
};

const refreshDate = async (
    tx: Transaction,
    input: { accountId: string; countryCode: string; period: FreshnessDate; streamRolledUpAt: Date | null; timezone: string }
): Promise<DailyTargetRefreshResult> => {
    const { accountId, period } = input;
    await lockDailyTargetDate(tx, accountId, period.bucketDate);

    // Read report metadata after taking the lock so a daily report created or parsed meanwhile wins.
    const metadata = await tx
        .select({
            aggregation: reportDatasetMetadata.aggregation,
            lastReportCreatedAt: reportDatasetMetadata.lastReportCreatedAt,
            lastProcessedReportId: reportDatasetMetadata.lastProcessedReportId,
            reportId: reportDatasetMetadata.reportId,
            status: reportDatasetMetadata.status,
        })
        .from(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.countryCode, input.countryCode),
                eq(reportDatasetMetadata.entityType, 'target'),
                eq(reportDatasetMetadata.periodStart, period.periodStart),
                inArray(reportDatasetMetadata.aggregation, ['daily', 'hourly'])
            )
        );

    const decision = chooseDailyTargetSource({
        period,
        daily: metadata.find(row => row.aggregation === 'daily') ?? null,
        hourly: metadata.find(row => row.aggregation === 'hourly') ?? null,
        streamRolledUpAt: input.streamRolledUpAt,
        timezone: input.timezone,
    });
    const result = { ...period, decision, rowsDerived: 0, rowsChanged: 0, rowsRemoved: 0 };

    if (decision.source === 'daily') {
        return { ...result, outcome: 'kept-daily-report' };
    }

    const periodStart = period.periodStart.toISOString();
    const periodEnd = period.periodEnd.toISOString();

    const [counts] = await rows<{ hourly_keys: number; daily_rows: number }>(
        tx.execute(sql`
            SELECT
                (SELECT count(*)::int FROM (
                    SELECT 1 FROM performance_hourly
                    WHERE account_id = ${accountId}
                        AND entity_type = 'target'
                        AND bucket_start >= ${periodStart}::timestamptz
                        AND bucket_start < ${periodEnd}::timestamptz
                    GROUP BY ad_id, entity_id
                ) AS hourly_keys) AS hourly_keys,
                (SELECT count(*)::int FROM performance_daily
                    WHERE account_id = ${accountId} AND bucket_date = ${period.bucketDate}::date AND entity_type = 'target') AS daily_rows
        `)
    );
    const hourlyKeys = Number(counts?.hourly_keys ?? 0);

    // Never let a gap in hourly data erase a date the daily report already filled.
    if (hourlyKeys === 0 && Number(counts?.daily_rows ?? 0) > 0) {
        return { ...result, outcome: 'skipped-empty-hourly' };
    }

    const changed = await rows(
        tx.execute(sql`
            INSERT INTO performance_daily (
                account_id, bucket_start, bucket_date, campaign_id, ad_group_id, ad_id,
                entity_type, entity_id, target_match_type, impressions, clicks, spend, sales, purchases
            )
            SELECT
                account_id,
                ${periodStart}::timestamptz,
                ${period.bucketDate}::date,
                max(campaign_id),
                max(ad_group_id),
                ad_id,
                entity_type,
                entity_id,
                max(target_match_type),
                sum(impressions)::int,
                sum(clicks)::int,
                sum(spend),
                sum(sales),
                sum(purchases)::int
            FROM performance_hourly
            WHERE account_id = ${accountId}
                AND entity_type = 'target'
                AND bucket_start >= ${periodStart}::timestamptz
                AND bucket_start < ${periodEnd}::timestamptz
            GROUP BY account_id, ad_id, entity_type, entity_id
            ORDER BY ad_id, entity_id
            ON CONFLICT (account_id, bucket_date, ad_id, entity_type, entity_id) DO UPDATE SET
                bucket_start = excluded.bucket_start,
                campaign_id = excluded.campaign_id,
                ad_group_id = excluded.ad_group_id,
                target_match_type = excluded.target_match_type,
                impressions = excluded.impressions,
                clicks = excluded.clicks,
                spend = excluded.spend,
                sales = excluded.sales,
                purchases = excluded.purchases
            WHERE (
                performance_daily.bucket_start,
                performance_daily.campaign_id,
                performance_daily.ad_group_id,
                performance_daily.target_match_type,
                performance_daily.impressions,
                performance_daily.clicks,
                performance_daily.spend,
                performance_daily.sales,
                performance_daily.purchases
            ) IS DISTINCT FROM (
                excluded.bucket_start,
                excluded.campaign_id,
                excluded.ad_group_id,
                excluded.target_match_type,
                excluded.impressions,
                excluded.clicks,
                excluded.spend,
                excluded.sales,
                excluded.purchases
            )
            RETURNING 1
        `)
    );

    // Targets the hourly data no longer has (for example, daily-report rows with zero activity)
    // would otherwise double as stale extras on top of the derived day.
    const removed = await rows(
        tx.execute(sql`
            DELETE FROM performance_daily AS daily
            WHERE daily.account_id = ${accountId}
                AND daily.bucket_date = ${period.bucketDate}::date
                AND daily.entity_type = 'target'
                AND NOT EXISTS (
                    SELECT 1 FROM performance_hourly AS hourly
                    WHERE hourly.account_id = daily.account_id
                        AND hourly.bucket_start >= ${periodStart}::timestamptz
                        AND hourly.bucket_start < ${periodEnd}::timestamptz
                        AND hourly.ad_id = daily.ad_id
                        AND hourly.entity_type = daily.entity_type
                        AND hourly.entity_id = daily.entity_id
                )
            RETURNING 1
        `)
    );

    return { ...result, outcome: 'derived-from-hourly', rowsDerived: hourlyKeys, rowsChanged: changed.length, rowsRemoved: removed.length };
};

/**
 * Stream as-of for the account: the older of the latest successful rollup start and the latest
 * AMS message stored for its advertiser, or null when Stream is not fresh (see `resolveStreamAsOf`).
 */
const getStreamAsOf = async (database: OperationDatabase, accountId: string, countryCode: string, now: Date): Promise<Date | null> => {
    const [account] = await database
        .select({ entityId: advertiserAccount.entityId })
        .from(advertiserAccount)
        .where(and(eq(advertiserAccount.adsAccountId, accountId), eq(advertiserAccount.countryCode, countryCode)))
        .limit(1);
    const entityId = account?.entityId ?? null;
    if (!entityId) {
        return null;
    }

    const [rollup] = await database
        .select({ startedAt: jobMetrics.startedAt })
        .from(jobMetrics)
        .where(
            and(
                eq(jobMetrics.jobName, STREAM_ROLLUP_JOB_NAME),
                gte(jobMetrics.startedAt, new Date(now.getTime() - STREAM_ROLLUP_LOOKBACK_MS)),
                eq(jobMetrics.status, 'succeeded'),
                sql`${jobMetrics.input} ->> 'accountId' = ${accountId}`,
                sql`${jobMetrics.input} ->> 'countryCode' = ${countryCode}`
            )
        )
        .orderBy(desc(jobMetrics.startedAt))
        .limit(1);

    // Each lookup is a backward scan of the (advertiser_id, received_at) index.
    const [traffic] = await database.select({ receivedAt: amsSpTraffic.receivedAt }).from(amsSpTraffic).where(eq(amsSpTraffic.advertiserId, entityId)).orderBy(desc(amsSpTraffic.receivedAt)).limit(1);
    const [conversion] = await database
        .select({ receivedAt: amsSpConversion.receivedAt })
        .from(amsSpConversion)
        .where(eq(amsSpConversion.advertiserId, entityId))
        .orderBy(desc(amsSpConversion.receivedAt))
        .limit(1);
    const received = [traffic?.receivedAt, conversion?.receivedAt].filter((value): value is Date => value instanceof Date);

    return resolveStreamAsOf({
        hasEntityId: true,
        rollupStartedAt: rollup?.startedAt ?? null,
        latestReceivedAt: received.length > 0 ? new Date(Math.max(...received.map(value => value.getTime()))) : null,
        now,
    });
};

// postgres-js returns an array of rows; PGlite returns `{ rows }`.
const rows = async <T = unknown>(query: Promise<unknown>): Promise<T[]> => {
    const result = (await query) as T[] | { rows: T[] };
    return Array.isArray(result) ? result : result.rows;
};

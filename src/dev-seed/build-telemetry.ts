import type { InferInsertModel } from 'drizzle-orm';
import type { amsMetrics, apiMetrics, events, jobMetrics } from '@/db/schema';
import type { SeededRandom } from './random';
import type { SeedIds } from './seed-ids';

/**
 * Operational telemetry: worker job runs and the customer-facing events they
 * emit, Amazon Ads API call records, and Marketing Stream message counts.
 *
 * These are what the event stream, the job chart, the Ads API stats panel, and
 * the AMS card read. The stream metrics are deliberately dense over the last
 * hour, because the AMS card's live view buckets the last 60 minutes into five
 * minute columns and an empty one looks like an outage.
 */

type AmsMetricRow = InferInsertModel<typeof amsMetrics>;
type ApiMetricRow = InferInsertModel<typeof apiMetrics>;
type EventRow = InferInsertModel<typeof events>;
type JobMetricRow = InferInsertModel<typeof jobMetrics>;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Job names paired with the event each successful run reports. */
const JOB_SHAPES = [
    { every: 60, jobName: 'dispatch-due-reports', message: 'Dispatched {{badges}} due report datasets.' },
    { every: 120, jobName: 'update-report-datasets', message: 'Report datasets refreshed for {{badges}}.' },
    { every: 120, jobName: 'update-report-dataset-for-account', message: 'Report dataset window extended for {{badges}}.' },
    { every: 30, jobName: 'update-report-status', message: 'Report {{badges}} processed.' },
    { every: 360, jobName: 'sync-ad-entities', message: 'Ad entity exports dispatched for {{badges}}.' },
    { every: 360, jobName: 'sync-ad-entities-for-account', message: 'Campaigns, ad groups, ads, and targets refreshed for {{badges}}.' },
    { every: 60, jobName: 'summarize-hourly-target-stream', message: 'Hourly stream summarised for {{badges}}.' },
    { every: 60, jobName: 'summarize-hourly-target-stream-for-account', message: 'Updated {{badges}} with latest stream data.' },
    { every: 180, jobName: 'summarize-daily-target-stream', message: 'Daily stream summarised for {{badges}}.' },
    { every: 180, jobName: 'summarize-daily-target-stream-for-account', message: 'Updated {{badges}} with latest stream data.' },
    { every: 720, jobName: 'sync-change-history', message: 'Change history reconciled for {{badges}}.' },
    { every: 720, jobName: 'sync-change-history-for-account', message: 'Change history reconciled for {{badges}}.' },
] as const;

const API_SHAPES = [
    { apiName: 'createReport', mean: 14 },
    { apiName: 'retrieveReport', mean: 26 },
    { apiName: 'getExportStatus', mean: 18 },
    { apiName: 'exportCampaigns', mean: 3 },
    { apiName: 'exportAdGroups', mean: 3 },
    { apiName: 'exportAds', mean: 3 },
    { apiName: 'exportTargets', mean: 3 },
    { apiName: 'getChangeHistory', mean: 6 },
    { apiName: 'listAdvertiserAccounts', mean: 2 },
    { apiName: 'updateTargetBid', mean: 4 },
] as const;

const STREAM_ENTITY_TYPES = ['campaign', 'adGroup', 'ad', 'target', 'spTraffic', 'spConversion'] as const;
const STREAM_LIVE_MINUTES = 60;
const STREAM_BUCKET_MINUTES = 5;
const TELEMETRY_HOURS = 24;

export const buildTelemetry = (input: { accountId: string; countryCode: string; ids: SeedIds; now: Date; random: SeededRandom }) => {
    const jobs: JobMetricRow[] = [];
    const jobEvents: EventRow[] = [];

    for (const shape of JOB_SHAPES) {
        const runCount = Math.max(1, Math.floor((TELEMETRY_HOURS * 60) / shape.every / 4));
        for (let run = 0; run < runCount; run += 1) {
            const startedAt = new Date(input.now.getTime() - (run * shape.every + input.random.int(0, 12)) * MINUTE_MS);
            const durationMs = input.random.int(180, 26_000);
            const finishedAt = new Date(startedAt.getTime() + durationMs);
            // A single failing run, so the failure path in the chart and the
            // event stream both have something to render.
            const failed = shape.jobName === 'update-report-status' && run === 1;
            const jobMetricId = input.ids.next();

            jobs.push({
                bossJobId: `boss-${jobMetricId.slice(-12)}`,
                error: failed ? 'Amazon Ads API returned 429 after 4 attempts.' : null,
                finishedAt,
                id: jobMetricId,
                input: { accountId: input.accountId, countryCode: input.countryCode },
                jobName: shape.jobName,
                startedAt,
                status: failed ? 'failed' : 'succeeded',
            });

            jobEvents.push({
                accountId: input.accountId,
                badges: [`${input.countryCode} daily`],
                countryCode: input.countryCode,
                createdAt: finishedAt,
                jobMetricId,
                jobName: shape.jobName,
                message: failed ? 'Report {{badges}} failed in Amazon.' : shape.message,
                outcome: failed ? 'error' : 'ok',
                // The aggregation chart sums `rowsInserted` out of this payload.
                payload: { rowsInserted: failed ? 0 : input.random.int(40, 1400) },
            });
        }
    }

    return {
        amsMetrics: buildStreamMetrics(input),
        apiMetrics: buildApiMetrics(input),
        events: jobEvents,
        jobMetrics: jobs,
    };
};

const buildApiMetrics = (input: { ids: SeedIds; now: Date; random: SeededRandom }): ApiMetricRow[] => {
    const rows: ApiMetricRow[] = [];

    for (let hourOffset = 0; hourOffset < TELEMETRY_HOURS; hourOffset += 1) {
        for (const shape of API_SHAPES) {
            const callCount = input.random.poisson(shape.mean / 4);
            for (let call = 0; call < callCount; call += 1) {
                const timestamp = new Date(input.now.getTime() - hourOffset * HOUR_MS - input.random.int(0, 59) * MINUTE_MS);
                const rateLimited = input.random.chance(0.06);
                const failed = input.random.chance(0.03);

                rows.push({
                    amazonRetryAfterMs: rateLimited ? input.random.int(400, 4000) : null,
                    apiName: shape.apiName,
                    attemptCount: rateLimited ? input.random.int(2, 4) : 1,
                    durationMs: input.random.int(90, 3400),
                    error: failed ? 'Request failed after retries.' : null,
                    governorCooldownMs: rateLimited ? input.random.int(500, 6000) : null,
                    id: input.ids.next(),
                    itemCount: input.random.chance(0.3) ? input.random.int(1, 40) : null,
                    queueWaitMs: input.random.int(0, 1800),
                    rateLimitCount: rateLimited ? input.random.int(1, 3) : 0,
                    rateLimitRequestId: rateLimited ? `rq-${input.random.int(1_000_000, 9_999_999)}` : null,
                    rateLimitResponseContentType: rateLimited ? 'application/json' : null,
                    rateLimitResponseServer: rateLimited ? 'Server' : null,
                    region: 'na',
                    retryCount: rateLimited ? input.random.int(1, 3) : 0,
                    statusCode: failed ? 500 : rateLimited ? 429 : 200,
                    success: !failed,
                    timestamp,
                });
            }
        }
    }

    return rows;
};

/**
 * Marketing Stream deliveries. Dense five-minute coverage across the last hour
 * for the live card, then a thinner trail across the rest of the day for the
 * 24-hour view.
 */
const buildStreamMetrics = (input: { ids: SeedIds; now: Date; random: SeededRandom }): AmsMetricRow[] => {
    const rows: AmsMetricRow[] = [];

    for (let minuteOffset = 0; minuteOffset < STREAM_LIVE_MINUTES; minuteOffset += STREAM_BUCKET_MINUTES) {
        for (const entityType of STREAM_ENTITY_TYPES) {
            const messageCount = entityType === 'spTraffic' || entityType === 'spConversion' ? input.random.int(1, 3) : input.random.int(0, 1);
            for (let message = 0; message < messageCount; message += 1) {
                rows.push(buildStreamMetric(input, entityType, new Date(input.now.getTime() - (minuteOffset + input.random.int(0, 4)) * MINUTE_MS)));
            }
        }
    }

    for (let hourOffset = 1; hourOffset < TELEMETRY_HOURS; hourOffset += 1) {
        for (const entityType of STREAM_ENTITY_TYPES) {
            const messageCount = input.random.poisson(entityType === 'spTraffic' ? 2.2 : 0.9);
            for (let message = 0; message < messageCount; message += 1) {
                rows.push(buildStreamMetric(input, entityType, new Date(input.now.getTime() - hourOffset * HOUR_MS - input.random.int(0, 59) * MINUTE_MS)));
            }
        }
    }

    return rows;
};

const buildStreamMetric = (input: { ids: SeedIds; random: SeededRandom }, entityType: string, timestamp: Date): AmsMetricRow => {
    const success = !input.random.chance(0.02);

    return {
        durationMs: input.random.int(12, 900),
        error: success ? null : 'Handler threw while applying the message.',
        entityType,
        id: input.ids.next(),
        success,
        timestamp,
    };
};

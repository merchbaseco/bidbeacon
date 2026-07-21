/**
 * Job: Enforce retention for operational telemetry and raw AMS stream data.
 * Runs hourly and deletes bounded batches to avoid long transactions.
 */

import { type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { boss } from '@/jobs/boss';
import { withJobMetrics } from '@/utils/job-metrics';

const DAY_MS = 24 * 60 * 60 * 1000;
const AMS_METRICS_RETENTION_DAYS = 1;
const OPERATIONAL_RETENTION_DAYS = 30;
const RAW_STREAM_RETENTION_DAYS = 30;
const TELEMETRY_BATCH_SIZE = 25_000;
const RAW_STREAM_BATCH_SIZE = 50_000;
const MAX_BATCHES_PER_RUN = 4;

export const cleanupAmsMetricsJob = boss
    .createJob('cleanup-ams-metrics')
    .schedule({
        cron: '0 * * * *',
    })
    .work(async jobs => {
        await Promise.all(
            jobs.map(job =>
                withJobMetrics(
                    {
                        jobName: 'cleanup-ams-metrics',
                        bossJobId: job.id,
                        input: job.data,
                    },
                    async recorder => {
                        const amsMetricsCutoff = new Date(Date.now() - AMS_METRICS_RETENTION_DAYS * DAY_MS);
                        const operationalCutoff = new Date(Date.now() - OPERATIONAL_RETENTION_DAYS * DAY_MS);
                        const rawStreamCutoff = new Date(Date.now() - RAW_STREAM_RETENTION_DAYS * DAY_MS);

                        const deleted = {
                            amsMetrics: await deleteBatches(
                                sql`WITH candidates AS (
                                        SELECT id FROM ams_metrics
                                        WHERE timestamp < ${amsMetricsCutoff}
                                        ORDER BY timestamp
                                        LIMIT ${TELEMETRY_BATCH_SIZE}
                                    ), deleted AS (
                                        DELETE FROM ams_metrics USING candidates
                                        WHERE ams_metrics.id = candidates.id
                                        RETURNING 1
                                    ) SELECT count(*)::int AS "deletedCount" FROM deleted`,
                                TELEMETRY_BATCH_SIZE
                            ),
                            apiMetrics: await deleteBatches(
                                sql`WITH candidates AS (
                                        SELECT id FROM api_metrics
                                        WHERE timestamp < ${operationalCutoff}
                                        ORDER BY timestamp
                                        LIMIT ${TELEMETRY_BATCH_SIZE}
                                    ), deleted AS (
                                        DELETE FROM api_metrics USING candidates
                                        WHERE api_metrics.id = candidates.id
                                        RETURNING 1
                                    ) SELECT count(*)::int AS "deletedCount" FROM deleted`,
                                TELEMETRY_BATCH_SIZE
                            ),
                            jobMetrics: await deleteBatches(
                                sql`WITH candidates AS (
                                        SELECT id FROM job_metrics
                                        WHERE finished_at < ${operationalCutoff}
                                        ORDER BY finished_at
                                        LIMIT ${TELEMETRY_BATCH_SIZE}
                                    ), deleted AS (
                                        DELETE FROM job_metrics USING candidates
                                        WHERE job_metrics.id = candidates.id
                                        RETURNING 1
                                    ) SELECT count(*)::int AS "deletedCount" FROM deleted`,
                                TELEMETRY_BATCH_SIZE
                            ),
                            traffic: await deleteBatches(
                                sql`WITH candidates AS (
                                        SELECT idempotency_id FROM ams_sp_traffic
                                        WHERE time_window_start < ${rawStreamCutoff}
                                        ORDER BY time_window_start
                                        LIMIT ${RAW_STREAM_BATCH_SIZE}
                                    ), deleted AS (
                                        DELETE FROM ams_sp_traffic USING candidates
                                        WHERE ams_sp_traffic.idempotency_id = candidates.idempotency_id
                                        RETURNING 1
                                    ) SELECT count(*)::int AS "deletedCount" FROM deleted`,
                                RAW_STREAM_BATCH_SIZE
                            ),
                            conversions: await deleteBatches(
                                sql`WITH candidates AS (
                                        SELECT idempotency_id FROM ams_sp_conversion
                                        WHERE time_window_start < ${rawStreamCutoff}
                                        ORDER BY time_window_start
                                        LIMIT ${RAW_STREAM_BATCH_SIZE}
                                    ), deleted AS (
                                        DELETE FROM ams_sp_conversion USING candidates
                                        WHERE ams_sp_conversion.idempotency_id = candidates.idempotency_id
                                        RETURNING 1
                                    ) SELECT count(*)::int AS "deletedCount" FROM deleted`,
                                RAW_STREAM_BATCH_SIZE
                            ),
                        };

                        recorder.addEvent({
                            message: `Retention cleanup removed ${Object.values(deleted).reduce((total, count) => total + count, 0)} rows.`,
                            payload: {
                                deleted,
                                cutoffs: {
                                    amsMetrics: amsMetricsCutoff.toISOString(),
                                    operational: operationalCutoff.toISOString(),
                                    rawStream: rawStreamCutoff.toISOString(),
                                },
                            },
                        });
                    }
                )
            )
        );
    });

const deleteBatches = async (query: SQL, batchSize: number): Promise<number> => {
    let total = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const rows = await db.execute<{ deletedCount: number }>(query);
        const deletedCount = Number(rows[0]?.deletedCount ?? 0);
        total += deletedCount;
        if (deletedCount < batchSize) {
            break;
        }
    }
    return total;
};

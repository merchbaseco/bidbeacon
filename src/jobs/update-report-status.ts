/**
 * Job: Update report status for a specific report dataset.
 * Handles the async processing of report status updates including state machine logic,
 * report creation, parsing, and status updates.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, eq, type InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { reportDatasetMetadata } from '@/db/schema';
import { gateAccountWork } from '@/jobs/account-access-gate';
import { createReportForDataset } from '@/lib/create-report/index';
import { parseReport } from '@/lib/parse-report/index';
import { getNextRefreshTime } from '@/lib/report-status-state-machine/eligibility';
import { getNextAction } from '@/lib/report-status-state-machine/state-machine';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports';
import { utcNow } from '@/utils/date';
import { formatError, serializeError } from '@/utils/errors';
import { emitEvent } from '@/utils/events';
import { withJobMetrics } from '@/utils/job-metrics';
import { getTimezoneForCountry } from '@/utils/timezones';
import { boss } from './boss';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
    timestamp: z.string(),
    aggregation: z.enum(AGGREGATION_TYPES),
    entityType: z.enum(ENTITY_TYPES),
    claimed: z.boolean().optional(),
});

export const updateReportStatusJob = boss
    .createJob('update-report-status')
    .input(jobInputSchema)
    .options({
        batchSize: 5, // Fetch and process 5 jobs per handler invocation
    })
    .work(async jobs => {
        // Process all jobs in the batch concurrently
        // Note: With batchSize: 1 (default), this will be a single job, but we handle batches
        // in case batchSize is increased in the future
        await Promise.all(
            jobs.map(job => {
                const { accountId, countryCode, timestamp, aggregation, entityType, claimed = false } = job.data;
                const date = new Date(timestamp);

                return withJobMetrics(
                    {
                        jobName: 'update-report-status',
                        bossJobId: job.id,
                        input: job.data,
                        accountId,
                        countryCode,
                    },
                    async recorder => {
                        if (!(await gateAccountWork({ accountId, countryCode, recorder }))) {
                            if (claimed) {
                                await releaseClaimedReport({ accountId, aggregation, countryCode, date, entityType });
                            }
                            return;
                        }

                        const timezone = getTimezoneForCountry(countryCode);
                        const datasetBadge = formatDatasetBadge(date, aggregation, entityType, timezone);
                        const buildBadges = (reportId?: string | null) => {
                            const badges: string[] = [];
                            const reportBadge = formatReportBadge(reportId);
                            if (reportBadge) {
                                badges.push(reportBadge);
                            }
                            badges.push(datasetBadge);
                            return badges;
                        };
                        const buildFreshnessMetrics = (row?: InferSelectModel<typeof reportDatasetMetadata>) => {
                            const observedAt = Date.now();
                            return {
                                periodAgeMs: Math.max(0, observedAt - date.getTime()),
                                refreshDueAt: row?.nextRefreshAt?.toISOString() ?? null,
                                refreshDelayMs: row?.nextRefreshAt ? Math.max(0, observedAt - row.nextRefreshAt.getTime()) : null,
                            };
                        };

                        let action: string | undefined;
                        let reportDatum: InferSelectModel<typeof reportDatasetMetadata> | undefined;

                        try {
                            // Fetch current row once at the start
                            reportDatum = await db.query.reportDatasetMetadata.findFirst({
                                where: and(
                                    eq(reportDatasetMetadata.accountId, accountId),
                                    eq(reportDatasetMetadata.periodStart, date),
                                    eq(reportDatasetMetadata.aggregation, aggregation),
                                    eq(reportDatasetMetadata.entityType, entityType)
                                ),
                            });

                            if (!reportDatum) {
                                return;
                            }

                            // Atomically claim the row so duplicate jobs cannot issue duplicate API calls.
                            if (claimed) {
                                if (!reportDatum.refreshing) {
                                    return;
                                }
                            } else {
                                const claimedReport = await claimReport(reportDatum);
                                if (!claimedReport) {
                                    return;
                                }
                                reportDatum = claimedReport;
                            }

                            // Determine next action using state machine
                            // The state machine will fetch report status if reportId exists
                            action = await getNextAction(
                                reportDatum.periodStart,
                                reportDatum.aggregation as 'hourly' | 'daily',
                                reportDatum.entityType as 'target' | 'product',
                                reportDatum.lastReportCreatedAt,
                                reportDatum.reportId,
                                countryCode
                            );

                            switch (action) {
                                case 'none': {
                                    await setNextRefreshAt(reportDatum, getNextRefreshTime(reportDatum));
                                    await setRefreshing(reportDatum, false);
                                    break;
                                }

                                case 'create': {
                                    const reportId = await createReportForDataset({ accountId, countryCode, timestamp, aggregation, entityType });
                                    const updatedRow = await setReport(reportDatum, reportId);
                                    await setNextRefreshAt(updatedRow, getNextRefreshTime(updatedRow));
                                    await setStatus(updatedRow, 'fetching');
                                    await setRefreshing(updatedRow, false);

                                    recorder.addEvent({
                                        message: 'Report {{badges}} started downloading.',
                                        badges: buildBadges(reportId),
                                        payload: {
                                            accountId,
                                            countryCode,
                                            aggregation,
                                            entityType,
                                            periodStart: date.toISOString(),
                                            reportId,
                                            ...buildFreshnessMetrics(reportDatum),
                                        },
                                    });
                                    break;
                                }

                                case 'process': {
                                    // Set status to 'parsing' at the start of parsing
                                    await setStatus(reportDatum, 'parsing');
                                    const parseResult = await parseReport(reportDatum.uid);

                                    // Mark report as processed: clear reportId, set lastProcessedReportId
                                    const processedRow = await markReportProcessed(reportDatum, reportDatum.reportId);
                                    await setNextRefreshAt(processedRow, getNextRefreshTime(processedRow));
                                    await setRefreshing(processedRow, false);

                                    recorder.addEvent({
                                        message: `Report {{badges}} processed. ${parseResult.rowsProcessed} rows, ${parseResult.changedCount} changed, ${parseResult.errorCount} errors.`,
                                        badges: buildBadges(reportDatum.reportId ?? null),
                                        payload: {
                                            accountId,
                                            countryCode,
                                            aggregation,
                                            entityType,
                                            periodStart: date.toISOString(),
                                            reportId: reportDatum.reportId ?? null,
                                            rowsProcessed: parseResult.rowsProcessed,
                                            successCount: parseResult.successCount,
                                            changedCount: parseResult.changedCount,
                                            errorCount: parseResult.errorCount,
                                            errorSamples: parseResult.errorSamples,
                                            ...buildFreshnessMetrics(reportDatum),
                                        },
                                    });
                                    break;
                                }

                                case 'fail': {
                                    const failedReportId = reportDatum.reportId;
                                    const failedRow = await markReportFailed(reportDatum, `Amazon marked report ${failedReportId} as failed.`);
                                    await setNextRefreshAt(failedRow, getNextRefreshTime(failedRow));
                                    await setRefreshing(failedRow, false);

                                    recorder.setErrorEvent({
                                        message: 'Report {{badges}} failed in Amazon.',
                                        badges: buildBadges(failedReportId),
                                        payload: {
                                            accountId,
                                            countryCode,
                                            aggregation,
                                            entityType,
                                            periodStart: date.toISOString(),
                                            reportId: failedReportId,
                                            ...buildFreshnessMetrics(reportDatum),
                                        },
                                    });
                                    recorder.markFailure(`Amazon marked report ${failedReportId} as failed.`);
                                    break;
                                }

                                default:
                                    throw new Error(`Unknown action received from state machine: ${action}`);
                            }

                            if (reportDatum.error && action !== 'fail') {
                                await clearError(reportDatum);
                            }
                        } catch (error) {
                            const governorRetryAt = getGovernorRetryAt(error);
                            if (reportDatum && governorRetryAt) {
                                await deferReport(reportDatum, new Date(governorRetryAt));
                                recorder.addEvent({
                                    message: 'Report {{badges}} creation deferred until the next governor slot.',
                                    badges: buildBadges(reportDatum.reportId ?? null),
                                    payload: {
                                        accountId,
                                        countryCode,
                                        aggregation,
                                        entityType,
                                        periodStart: date.toISOString(),
                                        reportId: reportDatum.reportId ?? null,
                                        retryAt: new Date(governorRetryAt).toISOString(),
                                        ...buildFreshnessMetrics(reportDatum),
                                    },
                                });
                                return;
                            }

                            const message = formatError(error);
                            recorder.setErrorEvent({
                                message: `Report {{badges}} failed: ${message}`,
                                badges: buildBadges(reportDatum?.reportId ?? null),
                                payload: {
                                    accountId,
                                    countryCode,
                                    aggregation,
                                    entityType,
                                    periodStart: date.toISOString(),
                                    reportId: reportDatum?.reportId ?? null,
                                    error: message,
                                    errorDetails: serializeError(error),
                                    ...buildFreshnessMetrics(reportDatum),
                                },
                            });
                            recorder.markFailure(message);
                            if (reportDatum) {
                                await setNextRefreshAt(reportDatum, new Date(Date.now() + 5 * 60 * 1000));
                                await setError(reportDatum, error);
                            }
                        }
                    }
                );
            })
        );
    });

// ============================================================================
// Helper Functions
// ============================================================================

const releaseClaimedReport = async (input: { accountId: string; aggregation: (typeof AGGREGATION_TYPES)[number]; countryCode: string; date: Date; entityType: (typeof ENTITY_TYPES)[number] }) => {
    const [releasedRow] = await db
        .update(reportDatasetMetadata)
        .set({ refreshing: false })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, input.accountId),
                eq(reportDatasetMetadata.countryCode, input.countryCode),
                eq(reportDatasetMetadata.periodStart, input.date),
                eq(reportDatasetMetadata.aggregation, input.aggregation),
                eq(reportDatasetMetadata.entityType, input.entityType)
            )
        )
        .returning();

    if (releasedRow) {
        emitEvent({ type: 'report:refreshed', row: releasedRow });
    }
};

/**
 * Atomically claims a report row and emits an update event.
 */
async function claimReport(row: InferSelectModel<typeof reportDatasetMetadata>): Promise<InferSelectModel<typeof reportDatasetMetadata> | null> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ refreshing: true })
        .where(and(eq(reportDatasetMetadata.uid, row.uid), eq(reportDatasetMetadata.refreshing, false)))
        .returning();

    if (!updatedRow) {
        return null;
    }

    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });
    return updatedRow;
}

/**
 * Sets refreshing=false and emits update event.
 */
async function setRefreshing(row: InferSelectModel<typeof reportDatasetMetadata>, refreshing: boolean): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ refreshing })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

/**
 * Updates the status for a report datum and emits update event.
 */
async function setStatus(row: InferSelectModel<typeof reportDatasetMetadata>, status: string): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ status })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

/**
 * Marks a report as processed: clears reportId, sets lastProcessedReportId, and emits update event.
 * Returns the updated row.
 */
async function markReportProcessed(row: InferSelectModel<typeof reportDatasetMetadata>, reportId: string | null): Promise<InferSelectModel<typeof reportDatasetMetadata>> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            status: 'completed',
            reportId: null,
            lastProcessedReportId: reportId,
            error: null,
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (!updatedRow) {
        throw new Error(`Failed to mark report as processed for ${row.accountId}`);
    }

    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });

    return updatedRow;
}

const markReportFailed = async (row: InferSelectModel<typeof reportDatasetMetadata>, error: string): Promise<InferSelectModel<typeof reportDatasetMetadata>> => {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            status: 'error',
            reportId: null,
            error,
        })
        .where(eq(reportDatasetMetadata.uid, row.uid))
        .returning();

    if (!updatedRow) {
        throw new Error(`Failed to record Amazon report failure for ${row.accountId}`);
    }

    emitEvent({ type: 'report:refreshed', row: updatedRow });
    return updatedRow;
};

async function setNextRefreshAt(row: InferSelectModel<typeof reportDatasetMetadata>, nextRefreshAt: Date | null): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ nextRefreshAt })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

/**
 * Sets the reportId and lastReportCreatedAt after a report is created via the Amazon Ads API.
 * Returns the updated row.
 */
async function setReport(row: InferSelectModel<typeof reportDatasetMetadata>, reportId: string): Promise<InferSelectModel<typeof reportDatasetMetadata>> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            reportId,
            lastReportCreatedAt: utcNow(),
        })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        )
        .returning();

    if (!updatedRow) {
        throw new Error(`Failed to update metadata for report ${reportId}`);
    }

    emitEvent({
        type: 'report:refreshed',
        row: updatedRow,
    });

    return updatedRow;
}

/**
 * Handles errors during report status update job execution.
 * Builds detailed error message, logs error, sets error state, schedules retry, and emits events.
 */
async function setError(reportDatum: typeof reportDatasetMetadata.$inferSelect, error: unknown): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ status: 'error', error: formatError(error), refreshing: false })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, reportDatum.accountId),
                eq(reportDatasetMetadata.periodStart, reportDatum.periodStart),
                eq(reportDatasetMetadata.aggregation, reportDatum.aggregation),
                eq(reportDatasetMetadata.entityType, reportDatum.entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

const deferReport = async (row: InferSelectModel<typeof reportDatasetMetadata>, nextRefreshAt: Date): Promise<void> => {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            error: null,
            nextRefreshAt,
            refreshing: false,
            status: row.lastProcessedReportId ? 'completed' : 'missing',
        })
        .where(eq(reportDatasetMetadata.uid, row.uid))
        .returning();

    if (updatedRow) {
        emitEvent({ type: 'report:refreshed', row: updatedRow });
    }
};

async function clearError(row: InferSelectModel<typeof reportDatasetMetadata>): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({ error: null })
        .where(
            and(
                eq(reportDatasetMetadata.accountId, row.accountId),
                eq(reportDatasetMetadata.periodStart, row.periodStart),
                eq(reportDatasetMetadata.aggregation, row.aggregation),
                eq(reportDatasetMetadata.entityType, row.entityType)
            )
        );

    if (updatedRow) {
        emitEvent({
            type: 'report:refreshed',
            row: updatedRow,
        });
    }
}

const getGovernorRetryAt = (error: unknown): number | null => {
    let current = error;
    const visited = new Set<unknown>();

    while (current instanceof Error && !visited.has(current)) {
        visited.add(current);
        const retryAt = (current as Error & { governorRetryAt?: unknown }).governorRetryAt;
        if (typeof retryAt === 'number' && Number.isFinite(retryAt) && retryAt > Date.now()) {
            return retryAt;
        }
        current = (current as Error & { cause?: unknown }).cause;
    }

    return null;
};

const formatReportBadge = (reportId?: string | null) => {
    if (!reportId) {
        return null;
    }
    const shortId = reportId.slice(-6).toUpperCase();
    return shortId;
};

const formatDatasetBadge = (periodStart: Date, aggregation: string, entityType: string, timezone: string) => {
    const dateLabel = formatInTimeZone(periodStart, timezone, 'MMM d');
    return `${aggregation} ${entityType} · ${dateLabel}`;
};

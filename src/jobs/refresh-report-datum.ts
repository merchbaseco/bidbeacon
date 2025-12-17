/**
 * Job: Refresh report datum for a specific report dataset.
 * Handles the async processing of report refresh including state machine logic,
 * report creation, parsing, and status updates.
 */

import { toZonedTime } from 'date-fns-tz';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createReport } from '@/amazon-ads/create-report.js';
import { reportConfigs } from '@/config/reports/configs.js';
import { db } from '@/db/index.js';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema.js';
import { parseReport } from '@/lib/parse-report/index';
import { getNextAction } from '@/lib/report-datum-state-machine';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports.js';
import { utcAddHours, utcNow } from '@/utils/date.js';
import { emitReportDatasetMetadataUpdated } from '@/utils/emit-report-dataset-metadata-updated.js';
import { getTimezoneForCountry } from '@/utils/timezones.js';
import { boss } from './boss.js';

// ============================================================================
// Job Definition
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
    timestamp: z.string(),
    aggregation: z.enum(AGGREGATION_TYPES),
    entityType: z.enum(ENTITY_TYPES),
});

export const refreshReportDatumJob = boss
    .createJob('refresh-report-datum')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            const { accountId, countryCode, timestamp, aggregation, entityType } = job.data;
            const date = new Date(timestamp);

            console.log(`[Refresh Report Datum] Starting job (ID: ${job.id}) for ${aggregation}/${entityType} at ${timestamp}`);

            try {
                // Set refreshing=true in database
                await setRefreshing(true, accountId, date, aggregation, entityType);

                // Verify report datum exists
                const reportDatum = await db.query.reportDatasetMetadata.findFirst({
                    where: and(
                        eq(reportDatasetMetadata.accountId, accountId),
                        eq(reportDatasetMetadata.timestamp, date),
                        eq(reportDatasetMetadata.aggregation, aggregation),
                        eq(reportDatasetMetadata.entityType, entityType)
                    ),
                });

                if (!reportDatum) {
                    console.log(`[Refresh Report Datum] Report datum not found`);
                    return;
                }

                // Determine next action using state machine
                // The state machine will fetch report status if reportId exists
                console.log(`[Refresh Report Datum] Determining next action using state machine`);
                const action = await getNextAction(reportDatum.timestamp, reportDatum.aggregation as 'hourly' | 'daily', reportDatum.lastReportCreatedAt, reportDatum.reportId, countryCode);
                console.log(`[Refresh Report Datum] State machine returned action: ${action}`);

                if (action === 'none') {
                    console.log(`[Refresh Report Datum] Action is 'none'`);
                    await setRefreshing(false, accountId, date, aggregation, entityType);
                    return;
                }

                if (action === 'process') {
                    // Process the report
                    console.log(`[Refresh Report Datum] Action is 'process', parsing report`);
                    await parseReport({
                        accountId,
                        countryCode,
                        timestamp,
                        aggregation,
                        entityType,
                    });
                    console.log(`[Refresh Report Datum] Report parsed successfully`);

                    await setRefreshing(false, accountId, date, aggregation, entityType);
                    return;
                }

                if (action === 'create') {
                    // Create a new report
                    console.log(`[Refresh Report Datum] Action is 'create', creating new report`);
                    const reportConfig = reportConfigs[aggregation][entityType];
                    const account = await db.query.advertiserAccount.findFirst({
                        where: eq(advertiserAccount.adsAccountId, accountId),
                        columns: {
                            adsAccountId: true,
                        },
                    });

                    if (!account) {
                        await setRefreshing(false, accountId, date, aggregation, entityType, 'Advertiser account not found');
                        return;
                    }

                    const windowStart = new Date(timestamp);
                    const windowEnd = aggregation === 'hourly' ? utcAddHours(windowStart, 1) : windowStart;

                    const formatDate = (date: Date): string => {
                        const isoString = date.toISOString();
                        const datePart = isoString.split('T')[0];
                        if (!datePart) {
                            throw new Error('Failed to format date');
                        }
                        return datePart;
                    };

                    const startDate = formatDate(windowStart);
                    const endDate = formatDate(windowEnd);

                    const response = await createReport(
                        {
                            accessRequestedAccounts: [
                                {
                                    advertiserAccountId: account.adsAccountId,
                                },
                            ],
                            reports: [
                                {
                                    format: reportConfig.format,
                                    periods: [
                                        {
                                            datePeriod: {
                                                startDate,
                                                endDate,
                                            },
                                        },
                                    ],
                                    query: {
                                        fields: reportConfig.fields,
                                    },
                                },
                            ],
                        },
                        'na'
                    );

                    if (response.success && response.success.length > 0) {
                        const reportId = response.success[0]?.report?.reportId;
                        if (reportId) {
                            // Convert current UTC time to country's timezone and store as timezone-less timestamp
                            const timezone = getTimezoneForCountry(countryCode);
                            const nowUtc = utcNow();
                            const zonedTime = toZonedTime(nowUtc, timezone);
                            const lastReportCreatedAt = new Date(
                                zonedTime.getFullYear(),
                                zonedTime.getMonth(),
                                zonedTime.getDate(),
                                zonedTime.getHours(),
                                zonedTime.getMinutes(),
                                zonedTime.getSeconds()
                            );

                            await db
                                .update(reportDatasetMetadata)
                                .set({
                                    reportId,
                                    status: 'fetching',
                                    lastRefreshed: utcNow(),
                                    lastReportCreatedAt,
                                    error: null,
                                })
                                .where(
                                    and(
                                        eq(reportDatasetMetadata.accountId, accountId),
                                        eq(reportDatasetMetadata.timestamp, date),
                                        eq(reportDatasetMetadata.aggregation, aggregation),
                                        eq(reportDatasetMetadata.entityType, entityType)
                                    )
                                );
                        }
                    }

                    await setRefreshing(false, accountId, date, aggregation, entityType);
                    return;
                }

                // Set refreshing=false in database for unknown action
                await setRefreshing(false, accountId, date, aggregation, entityType, `Unknown action: ${action}`);
            } catch (error) {
                console.error(`[Refresh Report Datum] Error during refresh processing:`, error);
                // Set refreshing=false in database on error
                try {
                    await setRefreshing(false, accountId, date, aggregation, entityType, error instanceof Error ? error.message : 'Unknown error');
                } catch (updateError) {
                    console.error(`[Refresh Report Datum] Failed to update refreshing state on error:`, updateError);
                }
            }
        }
    });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sets the refreshing state for a report datum and emits the update event
 */
async function setRefreshing(refreshing: boolean, accountId: string, timestamp: Date, aggregation: string, entityType: string, error?: string | null): Promise<void> {
    const updateData: { refreshing: boolean; error?: string | null } = { refreshing };
    if (error !== undefined) {
        updateData.error = error;
    }

    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set(updateData)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, accountId),
                eq(reportDatasetMetadata.timestamp, timestamp),
                eq(reportDatasetMetadata.aggregation, aggregation),
                eq(reportDatasetMetadata.entityType, entityType)
            )
        )
        .returning();

    if (updatedRow) {
        emitReportDatasetMetadataUpdated(updatedRow);
    }
}

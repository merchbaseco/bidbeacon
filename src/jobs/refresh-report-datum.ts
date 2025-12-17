/**
 * Job: Refresh report datum for a specific report dataset.
 * Handles the async processing of report refresh including state machine logic,
 * report creation, parsing, and status updates.
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import { createReportForDataset } from '@/lib/create-report/index.js';
import { parseReport } from '@/lib/parse-report/index';
import { getNextAction } from '@/lib/report-datum-state-machine';
import type { AggregationType, EntityType } from '@/types/reports.js';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports.js';
import { emitReportDatasetMetadataUpdated } from '@/utils/emit-report-dataset-metadata-updated.js';
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
                // Set refreshing=true in database and get the report datum
                const reportDatum = await setRefreshing(true, accountId, date, aggregation, entityType);

                if (!reportDatum) {
                    console.log(`[Refresh Report Datum] Report datum not found`);
                    return;
                }

                // Determine next action using state machine
                // The state machine will fetch report status if reportId exists
                console.log(`[Refresh Report Datum] Determining next action using state machine`);
                const action = await getNextAction(reportDatum.timestamp, reportDatum.aggregation as 'hourly' | 'daily', reportDatum.lastReportCreatedAt, reportDatum.reportId, countryCode);
                console.log(`[Refresh Report Datum] State machine returned action: ${action}`);

                switch (action) {
                    case 'none':
                        await handleNoneAction(accountId, date, aggregation, entityType);
                        return;

                    case 'process':
                        await handleProcessAction(accountId, timestamp, date, aggregation, entityType);
                        return;

                    case 'create':
                        await handleCreateAction(accountId, countryCode, timestamp, date, aggregation, entityType);
                        return;

                    default:
                        // Set refreshing=false in database for unknown action
                        await setRefreshing(false, accountId, date, aggregation, entityType, `Unknown action: ${action}`);
                        return;
                }
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
 * Sets the refreshing state for a report datum and emits the update event.
 * Returns the updated report datum row, or null if it doesn't exist.
 */
async function setRefreshing(
    refreshing: boolean,
    accountId: string,
    timestamp: Date,
    aggregation: AggregationType,
    entityType: EntityType,
    error?: string | null
): Promise<typeof reportDatasetMetadata.$inferSelect | null> {
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
        return updatedRow;
    }

    // If update didn't return a row, check if it exists (maybe it wasn't updated for some reason)
    const existingRow = await db.query.reportDatasetMetadata.findFirst({
        where: and(
            eq(reportDatasetMetadata.accountId, accountId),
            eq(reportDatasetMetadata.timestamp, timestamp),
            eq(reportDatasetMetadata.aggregation, aggregation),
            eq(reportDatasetMetadata.entityType, entityType)
        ),
    });

    return existingRow ?? null;
}

/**
 * Updates the status for a report datum and emits the update event
 */
async function updateStatus(status: string, error: string | null, accountId: string, timestamp: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    const [updatedRow] = await db
        .update(reportDatasetMetadata)
        .set({
            status,
            error,
        })
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

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Handles the 'none' action - no work needed, just clear refreshing state
 */
async function handleNoneAction(accountId: string, timestamp: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    console.log(`[Refresh Report Datum] Action is 'none'`);
    await setRefreshing(false, accountId, timestamp, aggregation, entityType);
}

/**
 * Handles the 'process' action - parses an existing report
 */
async function handleProcessAction(accountId: string, timestamp: string, date: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    console.log(`[Refresh Report Datum] Action is 'process', parsing report`);

    // Set status to 'parsing' at the start of parsing
    await updateStatus('parsing', null, accountId, date, aggregation, entityType);

    try {
        await parseReport({
            accountId,
            timestamp,
            aggregation,
            entityType,
        });
        console.log(`[Refresh Report Datum] Report parsed successfully`);

        // Update status to 'completed' after successful parsing
        await updateStatus('completed', null, accountId, date, aggregation, entityType);
    } catch (error) {
        console.error(`[Refresh Report Datum] Error parsing report:`, error);
        // Update status to 'failed' on error
        await updateStatus('failed', error instanceof Error ? error.message : 'Unknown error', accountId, date, aggregation, entityType);
        throw error;
    }

    await setRefreshing(false, accountId, date, aggregation, entityType);
}

/**
 * Handles the 'create' action - creates a new report
 */
async function handleCreateAction(accountId: string, countryCode: string, timestamp: string, date: Date, aggregation: AggregationType, entityType: EntityType): Promise<void> {
    console.log(`[Refresh Report Datum] Action is 'create', creating new report`);
    try {
        const reportId = await createReportForDataset({
            accountId,
            countryCode,
            timestamp,
            aggregation,
            entityType,
        });

        if (!reportId) {
            console.log(`[Refresh Report Datum] Failed to create report - no reportId returned`);
            await setRefreshing(false, accountId, date, aggregation, entityType, 'Failed to create report');
            return;
        }

        console.log(`[Refresh Report Datum] Report created successfully with reportId: ${reportId}`);
    } catch (error) {
        console.error(`[Refresh Report Datum] Error creating report:`, error);
        await setRefreshing(false, accountId, date, aggregation, entityType, error instanceof Error ? error.message : 'Unknown error');
        return;
    }

    await setRefreshing(false, accountId, date, aggregation, entityType);
}

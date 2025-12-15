/**
 * API: Parse a completed report into the performance table.
 * Downloads the report CSV and inserts rows into the performance table.
 */

import { parse } from 'csv-parse/sync';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { retrieveReport } from '@/amazon-ads/retrieve-report.js';
import { db } from '@/db/index.js';
import { advertiserAccount, performance, reportDatasetMetadata, target } from '@/db/schema.js';
import { emitEvent } from '@/utils/events.js';

// ============================================================================
// Types
// ============================================================================

interface ReportRow {
    'dateRange.value': string;
    'budgetCurrency.value': string;
    'campaign.id': string;
    'campaign.name': string;
    'adGroup.id': string;
    'ad.id': string;
    'advertisedProduct.id': string;
    'advertisedProduct.marketplace': string;
    'target.value': string;
    'target.matchType': string;
    'searchTerm.value': string;
    'matchedTarget.value': string;
    'metric.impressions': string;
    'metric.clicks': string;
    'metric.purchases': string;
    'metric.sales': string;
    'metric.totalCost': string;
}

// ============================================================================
// Route Registration
// ============================================================================

export function registerParseReportRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/parse-report', async (request, reply) => {
        const bodySchema = z.object({
            accountId: z.string(),
            countryCode: z.string(),
            timestamp: z.string(), // ISO string
            aggregation: z.enum(['hourly', 'daily']),
        });

        const body = bodySchema.parse(request.body);
        const date = new Date(body.timestamp);

        console.log(`[API] Parse report request received: ${body.aggregation} for ${body.accountId} at ${body.timestamp}`);

        // Look up advertiser account to get profileId
        const account = await db.query.advertiserAccount.findFirst({
            where: eq(advertiserAccount.adsAccountId, body.accountId),
            columns: {
                adsAccountId: true,
                profileId: true,
            },
        });

        if (!account) {
            reply.status(404);
            return {
                success: false,
                error: 'Advertiser account not found',
            };
        }

        if (!account.profileId) {
            reply.status(400);
            return {
                success: false,
                error: 'Profile ID not found for this account',
            };
        }

        // Look up the report metadata to get the reportId
        const reportMetadata = await db.query.reportDatasetMetadata.findFirst({
            where: and(
                eq(reportDatasetMetadata.accountId, body.accountId),
                eq(reportDatasetMetadata.timestamp, date),
                eq(reportDatasetMetadata.aggregation, body.aggregation)
            ),
        });

        if (!reportMetadata) {
            reply.status(404);
            return {
                success: false,
                error: 'Report metadata not found',
            };
        }

        if (!reportMetadata.reportId) {
            reply.status(400);
            return {
                success: false,
                error: 'No reportId found for this report. Create the report first.',
            };
        }

        try {
            // First, retrieve the report to get the download URL
            const retrieveResponse = await retrieveReport(
                {
                    profileId: Number(account.profileId),
                    reportIds: [reportMetadata.reportId],
                },
                'na' // Default to North America region
            );

            // Get the report from the response
            const report = retrieveResponse.success?.[0]?.report;
            if (!report) {
                throw new Error('Report not found in retrieve response');
            }

            // Check if the report is completed
            if (report.status !== 'COMPLETED') {
                reply.status(400);
                return {
                    success: false,
                    error: `Report is not ready. Current status: ${report.status}`,
                };
            }

            // Get the download URL from completedReportParts
            const reportParts = report.completedReportParts;
            if (!reportParts || reportParts.length === 0) {
                throw new Error('No completed report parts found');
            }

            const reportUrl = reportParts[0]?.url;
            if (!reportUrl) {
                throw new Error('No URL found in report parts');
            }

            console.log(`[API] Downloading report from URL...`);

            // Download the report CSV
            const response = await fetch(reportUrl, {
                signal: AbortSignal.timeout(60000), // 60 second timeout
            });

            if (!response.ok) {
                throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
            }

            const csvContent = await response.text();

            // Parse CSV
            const rows = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
            }) as ReportRow[];

            console.log(`[API] Parsed ${rows.length} rows from CSV`);

            // Process each row and insert into performance table
            let insertedCount = 0;
            for (const row of rows) {
                // Validate required metrics exist
                validateRequiredMetrics(row);

                // Look up targetId based on match type
                const targetId = await lookupTargetId(row['adGroup.id'], row['target.value'], row['target.matchType']);

                if (!targetId) {
                    throw new Error(
                        `Could not find target for adGroupId: ${row['adGroup.id']}, targetValue: ${row['target.value']}, matchType: ${row['target.matchType']}`
                    );
                }

                // Upsert into performance table
                await db
                    .insert(performance)
                    .values({
                        accountId: body.accountId,
                        date,
                        aggregation: body.aggregation,
                        campaignId: row['campaign.id'],
                        adGroupId: row['adGroup.id'],
                        adId: row['ad.id'],
                        targetId,
                        targetMatchType: row['target.matchType'],
                        searchTerm: row['searchTerm.value'],
                        matchedTarget: row['matchedTarget.value'],
                        impressions: parseInt(row['metric.impressions'], 10),
                        clicks: parseInt(row['metric.clicks'], 10),
                        spend: row['metric.totalCost'],
                        sales: row['metric.sales'],
                        orders: parseInt(row['metric.purchases'], 10),
                    })
                    .onConflictDoUpdate({
                        target: [
                            performance.accountId,
                            performance.date,
                            performance.aggregation,
                            performance.adId,
                            performance.targetId,
                        ],
                        set: {
                            campaignId: row['campaign.id'],
                            adGroupId: row['adGroup.id'],
                            targetMatchType: row['target.matchType'],
                            searchTerm: row['searchTerm.value'],
                            matchedTarget: row['matchedTarget.value'],
                            impressions: parseInt(row['metric.impressions'], 10),
                            clicks: parseInt(row['metric.clicks'], 10),
                            spend: row['metric.totalCost'],
                            sales: row['metric.sales'],
                            orders: parseInt(row['metric.purchases'], 10),
                        },
                    });

                insertedCount++;
            }

            // Update report metadata status to completed
            await db
                .update(reportDatasetMetadata)
                .set({
                    status: 'completed',
                    error: null,
                })
                .where(
                    and(
                        eq(reportDatasetMetadata.accountId, body.accountId),
                        eq(reportDatasetMetadata.timestamp, date),
                        eq(reportDatasetMetadata.aggregation, body.aggregation)
                    )
                );

            // Emit event when complete
            emitEvent({
                type: 'reports:refreshed',
                accountId: body.accountId,
            });

            console.log(`[API] Parse report completed. Inserted/updated ${insertedCount} rows.`);

            return {
                success: true,
                data: {
                    rowsProcessed: insertedCount,
                },
            };
        } catch (error) {
            console.error('[API] Failed to parse report:', error);

            // Update report metadata status to failed
            await db
                .update(reportDatasetMetadata)
                .set({
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                })
                .where(
                    and(
                        eq(reportDatasetMetadata.accountId, body.accountId),
                        eq(reportDatasetMetadata.timestamp, date),
                        eq(reportDatasetMetadata.aggregation, body.aggregation)
                    )
                );

            // Emit event even on failure so UI updates
            emitEvent({
                type: 'reports:refreshed',
                accountId: body.accountId,
            });

            reply.status(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to parse report',
            };
        }
    });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates that all required metrics are present in the row.
 * Throws an error if any required metric is missing.
 */
function validateRequiredMetrics(row: ReportRow): void {
    const requiredMetrics = [
        'metric.impressions',
        'metric.clicks',
        'metric.purchases',
        'metric.sales',
        'metric.totalCost',
    ] as const;

    for (const metric of requiredMetrics) {
        if (row[metric] === undefined || row[metric] === null || row[metric] === '') {
            throw new Error(`Missing required metric: ${metric}`);
        }
    }

    // Also validate that the numeric values can be parsed
    const impressions = parseInt(row['metric.impressions'], 10);
    if (isNaN(impressions)) {
        throw new Error(`Invalid impressions value: ${row['metric.impressions']}`);
    }

    const clicks = parseInt(row['metric.clicks'], 10);
    if (isNaN(clicks)) {
        throw new Error(`Invalid clicks value: ${row['metric.clicks']}`);
    }

    const purchases = parseInt(row['metric.purchases'], 10);
    if (isNaN(purchases)) {
        throw new Error(`Invalid purchases value: ${row['metric.purchases']}`);
    }

    const sales = parseFloat(row['metric.sales']);
    if (isNaN(sales)) {
        throw new Error(`Invalid sales value: ${row['metric.sales']}`);
    }

    const totalCost = parseFloat(row['metric.totalCost']);
    if (isNaN(totalCost)) {
        throw new Error(`Invalid totalCost value: ${row['metric.totalCost']}`);
    }
}

/**
 * Looks up the targetId based on adGroupId and targetValue.
 *
 * For PHRASE, BROAD, or EXACT match types:
 *   - Match targetValue to targetKeyword with exact match
 *
 * For TARGETING match type:
 *   - Parse targetValue which looks like asin="..." or asin-expanded="..."
 *   - Match the extracted asin to targetAsin
 */
async function lookupTargetId(
    adGroupId: string,
    targetValue: string,
    matchType: string
): Promise<string | null> {
    // Keyword match types: PHRASE, BROAD, EXACT
    const keywordMatchTypes = ['PHRASE', 'BROAD', 'EXACT'];

    if (keywordMatchTypes.includes(matchType)) {
        // Match targetValue to targetKeyword
        const result = await db.query.target.findFirst({
            where: and(
                eq(target.adGroupId, adGroupId),
                eq(target.targetKeyword, targetValue)
            ),
            columns: { targetId: true },
        });

        return result?.targetId ?? null;
    }

    if (matchType === 'TARGETING') {
        // Parse ASIN from targetValue (e.g., asin="B0123ABC" or asin-expanded="B0123ABC")
        const asin = parseAsinFromTargetValue(targetValue);

        if (!asin) {
            throw new Error(`Could not parse ASIN from targetValue: ${targetValue}`);
        }

        // Match asin to targetAsin
        const result = await db.query.target.findFirst({
            where: and(
                eq(target.adGroupId, adGroupId),
                eq(target.targetAsin, asin)
            ),
            columns: { targetId: true },
        });

        return result?.targetId ?? null;
    }

    // Unknown match type
    throw new Error(`Unknown match type: ${matchType}`);
}

/**
 * Parses an ASIN from a targetValue string.
 * Expected formats:
 *   - asin="B0123ABC"
 *   - asin-expanded="B0123ABC"
 *
 * Returns the ASIN or null if not found.
 */
function parseAsinFromTargetValue(targetValue: string): string | null {
    // Match asin="..." or asin-expanded="..."
    const match = targetValue.match(/asin(?:-expanded)?="([^"]+)"/);
    return match?.[1] ?? null;
}


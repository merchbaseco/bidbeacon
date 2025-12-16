/**
 * API: Parse a completed report into the performance table.
 * Downloads the GZIP_JSON report and inserts rows into the performance table.
 */

import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { retrieveReport } from '@/amazon-ads/retrieve-report.js';
import { getReportConfig } from '@/config/reports/index.js';
import { db } from '@/db/index.js';
import { advertiserAccount, performance, reportDatasetMetadata, target } from '@/db/schema.js';

const gunzipAsync = promisify(gunzip);

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

        // Get report configuration based on aggregation type
        const reportConfig = getReportConfig(body.aggregation);

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
            where: and(eq(reportDatasetMetadata.accountId, body.accountId), eq(reportDatasetMetadata.timestamp, date), eq(reportDatasetMetadata.aggregation, body.aggregation)),
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

            // Download the gzipped report
            const response = await fetch(reportUrl, {
                signal: AbortSignal.timeout(60000), // 60 second timeout
            });

            if (!response.ok) {
                throw new Error(`Failed to download report: ${response.status} ${response.statusText}`);
            }

            // Decompress and parse JSON
            const compressedData = await response.arrayBuffer();
            const decompressedData = await gunzipAsync(Buffer.from(compressedData));
            const rawJson = JSON.parse(decompressedData.toString());

            // Validate with Zod schema from report config
            const rows = z.array(reportConfig.rowSchema).parse(rawJson);

            console.log(`[API] Parsed ${rows.length} rows from report`);

            // Process each row and insert into performance table
            let insertedCount = 0;
            for (const row of rows) {
                // Look up targetId based on match type
                const targetId = await lookupTargetId(row['adGroup.id'], row['target.value'], row['target.matchType']);

                if (!targetId) {
                    throw new Error(`Could not find target for adGroupId: ${row['adGroup.id']}, targetValue: ${row['target.value']}, matchType: ${row['target.matchType']}`);
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
                        impressions: row['metric.impressions'],
                        clicks: row['metric.clicks'],
                        spend: String(row['metric.totalCost']),
                        sales: String(row['metric.sales']),
                        orders: row['metric.purchases'],
                    })
                    .onConflictDoUpdate({
                        target: [performance.accountId, performance.date, performance.aggregation, performance.adId, performance.targetId],
                        set: {
                            campaignId: row['campaign.id'],
                            adGroupId: row['adGroup.id'],
                            targetMatchType: row['target.matchType'],
                            impressions: row['metric.impressions'],
                            clicks: row['metric.clicks'],
                            spend: String(row['metric.totalCost']),
                            sales: String(row['metric.sales']),
                            orders: row['metric.purchases'],
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
                .where(and(eq(reportDatasetMetadata.accountId, body.accountId), eq(reportDatasetMetadata.timestamp, date), eq(reportDatasetMetadata.aggregation, body.aggregation)));

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
                .where(and(eq(reportDatasetMetadata.accountId, body.accountId), eq(reportDatasetMetadata.timestamp, date), eq(reportDatasetMetadata.aggregation, body.aggregation)));

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
 * Looks up the targetId based on adGroupId, targetValue, and matchType.
 *
 * For PHRASE, BROAD, or EXACT match types:
 *   - Match targetValue to targetKeyword with exact match (using target export's match type values)
 *
 * For TARGETING_EXPRESSION match type:
 *   - Parse targetValue which looks like asin="..." or asin-expanded="..."
 *   - Match the extracted asin to targetAsin (using target export's match type values)
 *
 * For TARGETING_EXPRESSION_PREDEFINED match type:
 *   - targetValue is one of: "close-match", "loose-match", "substitutes", or "complements"
 *   - Match targetValue to targetType and matchType (using target export's match type vals)
 */
async function lookupTargetId(adGroupId: string, targetValue: string, matchType: string): Promise<string | null> {
    switch (matchType) {
        case 'PHRASE':
        case 'BROAD':
        case 'EXACT': {
            // Match targetValue to targetKeyword and matchType
            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetKeyword, targetValue), eq(target.targetMatchType, matchType)),
                columns: { targetId: true },
            });

            return result?.targetId ?? null;
        }

        case 'TARGETING_EXPRESSION': {
            // Parse ASIN from targetValue (e.g., asin="B0123ABC" or asin-expanded="B0123ABC")
            const asin = parseAsinFromTargetValue(targetValue);
            const targetExportMatchType = targetValue.includes('expanded') ? 'PRODUCT_SIMILAR' : 'PRODUCT_EXACT';

            if (!asin) {
                throw new Error(`Could not parse ASIN from targetValue: ${targetValue}`);
            }

            // Match asin to targetAsin and matchType
            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetAsin, asin), eq(target.targetMatchType, targetExportMatchType)),
                columns: { targetId: true },
            });

            return result?.targetId ?? null;
        }

        case 'TARGETING_EXPRESSION_PREDEFINED': {
            // Validate that targetValue is one of the expected predefined expression types
            const validPredefinedValues = ['close-match', 'loose-match', 'substitutes', 'complements'];
            if (!validPredefinedValues.includes(targetValue)) {
                throw new Error(`Invalid predefined expression value: ${targetValue}. Expected one of: ${validPredefinedValues.join(', ')}`);
            }

            const targetExportMatchType = (
                {
                    'close-match': 'SEARCH_CLOSE_MATCH',
                    'loose-match': 'SEARCH_LOOSE_MATCH',
                    substitutes: 'PRODUCT_SUBSTITUTES',
                    complements: 'PRODUCT_COMPLEMENTS',
                } as const
            )[targetValue as 'close-match' | 'loose-match' | 'substitutes' | 'complements'];

            // Match by matchType and targetType (predefined expression value is stored in targetType)
            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetMatchType, targetExportMatchType), eq(target.targetType, targetValue)),
                columns: { targetId: true },
            });

            return result?.targetId ?? null;
        }

        default:
            throw new Error(`Unknown match type: ${matchType}`);
    }
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

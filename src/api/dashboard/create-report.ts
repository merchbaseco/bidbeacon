import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createReport } from '@/amazon-ads/create-report.js';
import { db } from '@/db/index.js';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema.js';
import { utcAddDays, utcAddHours, utcNow } from '@/utils/date.js';

export function registerCreateReportRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/create-report', async (request, reply) => {
        const bodySchema = z.object({
            accountId: z.string(),
            countryCode: z.string(),
            timestamp: z.string(), // ISO string
            aggregation: z.enum(['hourly', 'daily']),
        });

        const body = bodySchema.parse(request.body);
        console.log(`[API] Create report request received: ${body.aggregation} for ${body.accountId}, country: ${body.countryCode} at ${body.timestamp}`);

        // Look up advertiser account to get adsAccountId and profileId
        const account = await db.query.advertiserAccount.findFirst({
            where: eq(advertiserAccount.id, body.accountId),
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

        // Parse timestamp and calculate date period
        const windowStart = new Date(body.timestamp);
        const windowEnd = body.aggregation === 'hourly' ? utcAddHours(windowStart, 1) : utcAddDays(windowStart, 1);

        // Format dates as YYYY-MM-DD
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

        // Default fields for the report (matching the example)
        const fields = [
            'dateRange.value',
            'budgetCurrency.value',
            'campaign.id',
            'campaign.name',
            'adGroup.id',
            'ad.id',
            'advertisedProduct.id',
            'advertisedProduct.marketplace',
            'target.value',
            'target.matchType',
            'searchTerm.value',
            'matchedTarget.value',
            'metric.impressions',
            'metric.clicks',
            'metric.purchases',
            'metric.sales',
            'timeZone.value',
        ];

        try {
            const response = await createReport(
                {
                    profileId: Number(account.profileId),
                    accessRequestedAccounts: [
                        {
                            advertiserAccountId: account.adsAccountId,
                        },
                    ],
                    reports: [
                        {
                            format: 'CSV',
                            periods: [
                                {
                                    datePeriod: {
                                        startDate,
                                        endDate,
                                    },
                                },
                            ],
                            query: {
                                fields,
                            },
                        },
                    ],
                },
                'na' // Default to North America region
            );

            // Extract reportId from response and update metadata table
            if (response.success && response.success.length > 0) {
                const reportId = response.success[0]?.report?.reportId;
                if (reportId) {
                    // Update report metadata with the new reportId and set status to 'fetching'
                    await db
                        .insert(reportDatasetMetadata)
                        .values({
                            accountId: body.accountId,
                            countryCode: body.countryCode,
                            timestamp: windowStart,
                            aggregation: body.aggregation,
                            status: 'fetching',
                            lastRefreshed: utcNow(),
                            reportId,
                            error: null,
                        })
                        .onConflictDoUpdate({
                            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.timestamp, reportDatasetMetadata.aggregation],
                            set: {
                                reportId,
                                status: 'fetching',
                                lastRefreshed: utcNow(),
                                error: null,
                            },
                        });
                    console.log(`[API] Updated report metadata with reportId: ${reportId} for ${body.accountId} at ${body.timestamp}`);
                }
            }

            return {
                success: true,
                data: response,
            };
        } catch (error) {
            console.error('[API] Failed to create report:', error);
            reply.status(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create report',
            };
        }
    });
}

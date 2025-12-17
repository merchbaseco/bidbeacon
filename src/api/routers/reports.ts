import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { createReport } from '@/amazon-ads/create-report.js';
import { retrieveReport } from '@/amazon-ads/retrieve-report.js';
import { reportConfigs } from '@/config/reports/configs.js';
import { db } from '@/db/index.js';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema.js';
import { updateReportDatasetForAccountJob } from '@/jobs/update-report-dataset-for-account.js';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports.js';
import { utcAddHours, utcNow } from '@/utils/date.js';
import { publicProcedure, router } from '../trpc.js';
import { parseReportHandler } from './reports/parse-report.js';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

export const reportsRouter = router({
    status: publicProcedure
        .input(
            z.object({
                accountId: z.string().default(DEFAULT_ACCOUNT_ID),
                countryCode: z.string().optional(),
                aggregation: z.enum(['hourly', 'daily']).default('daily'),
                from: z.string().datetime().optional(),
                to: z.string().datetime().optional(),
            })
        )
        .query(async ({ input }) => {
            const to = input.to ? new Date(input.to) : new Date();
            const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

            const conditions = [
                eq(reportDatasetMetadata.accountId, input.accountId),
                eq(reportDatasetMetadata.aggregation, input.aggregation),
                gte(reportDatasetMetadata.timestamp, from),
                lte(reportDatasetMetadata.timestamp, to),
            ];

            if (input.countryCode) {
                conditions.push(eq(reportDatasetMetadata.countryCode, input.countryCode));
            }

            const data = await db
                .select()
                .from(reportDatasetMetadata)
                .where(and(...conditions))
                .orderBy(desc(reportDatasetMetadata.timestamp));

            return { success: true, data };
        }),

    triggerUpdate: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .mutation(async ({ input }) => {
            console.log(`[API] Trigger update request received for account: ${input.accountId}, country: ${input.countryCode}`);
            const jobId = await updateReportDatasetForAccountJob.emit({
                accountId: input.accountId,
                countryCode: input.countryCode,
            });
            console.log(`[API] Update job queued with ID: ${jobId}`);
            return { success: true, message: 'Update job queued' };
        }),

    create: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
                timestamp: z.string(),
                aggregation: z.enum(AGGREGATION_TYPES),
                entityType: z.enum(ENTITY_TYPES),
            })
        )
        .mutation(async ({ input }) => {
            const reportConfig = reportConfigs[input.aggregation][input.entityType];
            console.log(`[API] Create report request received: ${input.aggregation}/${input.entityType} for ${input.accountId}, country: ${input.countryCode} at ${input.timestamp}`);

            const account = await db.query.advertiserAccount.findFirst({
                where: eq(advertiserAccount.adsAccountId, input.accountId),
                columns: {
                    adsAccountId: true,
                    profileId: true,
                },
            });

            if (!account) {
                throw new Error('Advertiser account not found');
            }

            if (!account.profileId) {
                throw new Error('Profile ID not found for this account');
            }

            const windowStart = new Date(input.timestamp);
            const windowEnd = input.aggregation === 'hourly' ? utcAddHours(windowStart, 1) : windowStart;

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
                    profileId: Number(account.profileId),
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
                    await db
                        .insert(reportDatasetMetadata)
                        .values({
                            accountId: input.accountId,
                            countryCode: input.countryCode,
                            timestamp: windowStart,
                            aggregation: input.aggregation,
                            entityType: input.entityType,
                            status: 'fetching',
                            lastRefreshed: utcNow(),
                            reportId,
                            error: null,
                        })
                        .onConflictDoUpdate({
                            target: [reportDatasetMetadata.accountId, reportDatasetMetadata.timestamp, reportDatasetMetadata.aggregation, reportDatasetMetadata.entityType],
                            set: {
                                reportId,
                                status: 'fetching',
                                lastRefreshed: utcNow(),
                                error: null,
                            },
                        });
                    console.log(`[API] Updated report metadata with reportId: ${reportId} for ${input.accountId} at ${input.timestamp}`);
                }
            }

            return {
                success: true,
                data: response,
            };
        }),

    retrieve: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                timestamp: z.string(),
                aggregation: z.enum(['hourly', 'daily']),
                entityType: z.enum(['target', 'product']),
            })
        )
        .mutation(async ({ input }) => {
            console.log(`[API] Retrieve report request received: ${input.aggregation}/${input.entityType} for ${input.accountId} at ${input.timestamp}`);

            const metadata = await db.query.reportDatasetMetadata.findFirst({
                where: and(
                    eq(reportDatasetMetadata.accountId, input.accountId),
                    eq(reportDatasetMetadata.timestamp, new Date(input.timestamp)),
                    eq(reportDatasetMetadata.aggregation, input.aggregation),
                    eq(reportDatasetMetadata.entityType, input.entityType)
                ),
                columns: {
                    reportId: true,
                },
            });

            if (!metadata || !metadata.reportId) {
                throw new Error('Report ID not found for this metadata record');
            }

            const account = await db.query.advertiserAccount.findFirst({
                where: eq(advertiserAccount.adsAccountId, input.accountId),
                columns: {
                    profileId: true,
                },
            });

            if (!account) {
                throw new Error('Advertiser account not found');
            }

            if (!account.profileId) {
                throw new Error('Profile ID not found for this account');
            }

            const response = await retrieveReport(
                {
                    profileId: Number(account.profileId),
                    reportIds: [metadata.reportId],
                },
                'na'
            );

            return {
                success: true,
                data: response,
            };
        }),

    parse: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
                timestamp: z.string(),
                aggregation: z.enum(AGGREGATION_TYPES),
                entityType: z.enum(ENTITY_TYPES),
            })
        )
        .mutation(async ({ input }) => {
            return await parseReportHandler(input);
        }),
});

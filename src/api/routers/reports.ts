import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { retrieveReport } from '@/amazon-ads/retrieve-report';
import { db } from '@/db/index';
import { reportDatasetMetadata } from '@/db/schema';
import { updateReportDatasetForAccountJob } from '@/jobs/update-report-dataset-for-account';
import { updateReportStatusJob } from '@/jobs/update-report-status';
import { createReportForDataset } from '@/lib/create-report/index';
import { parseReport } from '@/lib/parse-report/index';
import { AGGREGATION_TYPES, ENTITY_TYPES } from '@/types/reports';
import { publicProcedure, router } from '../trpc';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

export const reportsRouter = router({
    status: publicProcedure
        .input(
            z.object({
                accountId: z.string().default(DEFAULT_ACCOUNT_ID),
                countryCode: z.string().optional(),
                aggregation: z.enum(['hourly', 'daily']).default('daily'),
                entityType: z.enum(['target', 'product']).optional(),
                statusFilter: z.string().optional(),
                from: z.string().datetime().optional(),
                to: z.string().datetime().optional(),
                limit: z.number().min(1).max(100).default(10),
                offset: z.number().min(0).default(0),
            })
        )
        .query(async ({ input }) => {
            const to = input.to ? new Date(input.to) : new Date();
            const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

            const conditions = [
                eq(reportDatasetMetadata.accountId, input.accountId),
                eq(reportDatasetMetadata.aggregation, input.aggregation),
                gte(reportDatasetMetadata.periodStart, from),
                lte(reportDatasetMetadata.periodStart, to),
            ];

            if (input.countryCode) {
                conditions.push(eq(reportDatasetMetadata.countryCode, input.countryCode));
            }

            if (input.entityType) {
                conditions.push(eq(reportDatasetMetadata.entityType, input.entityType));
            }

            if (input.statusFilter && input.statusFilter !== 'all') {
                conditions.push(eq(reportDatasetMetadata.status, input.statusFilter));
            }

            const whereClause = and(...conditions);

            // Get total count for pagination
            const [totalResult] = await db
                .select({ count: count() })
                .from(reportDatasetMetadata)
                .where(whereClause);

            const total = totalResult?.count ?? 0;

            // Get paginated data
            const data = await db
                .select()
                .from(reportDatasetMetadata)
                .where(whereClause)
                .orderBy(desc(reportDatasetMetadata.periodStart))
                .limit(input.limit)
                .offset(input.offset);

            return {
                data,
                total,
            };
        }),

    triggerUpdate: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .mutation(async ({ input }) => {
            await updateReportDatasetForAccountJob.emit({
                accountId: input.accountId,
                countryCode: input.countryCode,
            });
            return true;
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
            const reportId = await createReportForDataset(input);
            return { reportId };
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
            const metadata = await db.query.reportDatasetMetadata.findFirst({
                where: and(
                    eq(reportDatasetMetadata.accountId, input.accountId),
                    eq(reportDatasetMetadata.periodStart, new Date(input.timestamp)),
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

            const response = await retrieveReport(
                {
                    reportIds: [metadata.reportId],
                },
                'na'
            );

            return response;
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
            const result = await parseReport({
                accountId: input.accountId,
                timestamp: input.timestamp,
                aggregation: input.aggregation,
                entityType: input.entityType,
            });
            return { rowsProcessed: result.rowsProcessed };
        }),

    refresh: publicProcedure
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
            // Queue the update status job
            const jobId = await updateReportStatusJob.emit({
                accountId: input.accountId,
                countryCode: input.countryCode,
                timestamp: input.timestamp,
                aggregation: input.aggregation,
                entityType: input.entityType,
            });
            return { jobId };
        }),
});

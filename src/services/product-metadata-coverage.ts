import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { ad, campaign, jobMetrics, productMetadata } from '@/db/schema';
import type { OperationDatabase } from '@/operations/operation-context';

export const getProductMetadataCoverage = async (database: OperationDatabase, input: { accountId: string; countryCode: string }) => {
    const [[coverage], runningJobs] = await Promise.all([
        database
            .select({
                advertisedCount: sql<number>`count(distinct ${ad.productAsin})`.mapWith(Number),
                hydratedCount: sql<number>`count(distinct case when ${productMetadata.title} is not null then ${ad.productAsin} end)`.mapWith(Number),
            })
            .from(ad)
            .innerJoin(campaign, eq(campaign.campaignId, ad.campaignId))
            .leftJoin(productMetadata, and(eq(productMetadata.countryCode, input.countryCode), eq(productMetadata.asin, ad.productAsin)))
            .where(and(eq(campaign.accountId, input.accountId), eq(campaign.countryCode, input.countryCode), isNotNull(ad.productAsin))),
        database
            .select({ id: jobMetrics.id })
            .from(jobMetrics)
            .where(
                and(
                    eq(jobMetrics.jobName, 'refresh-product-metadata'),
                    eq(jobMetrics.status, 'running'),
                    sql`${jobMetrics.input}->>'accountId' = ${input.accountId}`,
                    sql`${jobMetrics.input}->>'countryCode' = ${input.countryCode}`
                )
            )
            .limit(1),
    ]);

    return { ...(coverage ?? { advertisedCount: 0, hydratedCount: 0 }), fetching: runningJobs.length > 0 };
};

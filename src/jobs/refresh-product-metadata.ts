import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { ad, advertiserAccount, campaign } from '@/db/schema';
import { gateAccountWork } from '@/jobs/account-access-gate';
import { boss } from '@/jobs/boss';
import { resolveApiRegion, updateProductMetadata } from '@/services/product-metadata';
import { buildProductMetadataEvent } from '@/services/product-metadata-batches';
import { emitEvent } from '@/utils/events';
import { withJobMetrics } from '@/utils/job-metrics';

export const refreshProductMetadataJob = boss
    .createJob('refresh-product-metadata')
    .input(
        z
            .object({ accountId: z.string().optional(), countryCode: z.string().optional(), refreshStartedAt: z.string().datetime().optional() })
            .refine(
                input => Boolean(input.accountId) === Boolean(input.countryCode) && Boolean(input.accountId) === Boolean(input.refreshStartedAt),
                'accountId, countryCode, and refreshStartedAt must be provided together'
            )
    )
    .schedule({ cron: '0 4 * * 0' })
    .retry({ limit: 3, delay: 60, backoff: true })
    .work(async jobs => {
        for (const job of jobs) {
            await withJobMetrics(
                {
                    jobName: 'refresh-product-metadata',
                    bossJobId: job.id,
                    input: job.data,
                    accountId: job.data.accountId,
                    countryCode: job.data.countryCode,
                },
                async recorder => {
                    if (!job.data.accountId || !job.data.countryCode || !job.data.refreshStartedAt) {
                        const accounts = await db
                            .select({ adsAccountId: advertiserAccount.adsAccountId, countryCode: advertiserAccount.countryCode })
                            .from(advertiserAccount)
                            .where(eq(advertiserAccount.enabled, true));
                        const refreshStartedAt = new Date().toISOString();
                        await Promise.all(accounts.map(account => refreshProductMetadataJob.emit({ accountId: account.adsAccountId, countryCode: account.countryCode, refreshStartedAt })));
                        recorder.addEvent({ message: `Queued product metadata refresh for ${accounts.length} accounts.`, payload: { accountCount: accounts.length, trigger: 'weekly_refresh' } });
                        return;
                    }
                    if (!(await gateAccountWork({ accountId: job.data.accountId, countryCode: job.data.countryCode, recorder }))) return;

                    const account = await db.query.advertiserAccount.findFirst({
                        where: and(eq(advertiserAccount.adsAccountId, job.data.accountId), eq(advertiserAccount.countryCode, job.data.countryCode)),
                        columns: { adsAccountId: true, countryCode: true, profileId: true },
                    });
                    if (!account?.profileId) throw new Error(`Profile ID not found for account: ${job.data.accountId}`);

                    const rows = await db
                        .selectDistinct({ asin: ad.productAsin })
                        .from(ad)
                        .innerJoin(campaign, eq(campaign.campaignId, ad.campaignId))
                        .where(and(eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), isNotNull(ad.productAsin)));
                    const asins = rows.flatMap(row => (row.asin ? [row.asin] : []));
                    if (asins.length === 0) {
                        recorder.addEvent({ message: 'No advertised products to refresh.', payload: { trigger: 'weekly_refresh', requestedCount: 0, requestCount: 0 } });
                        return;
                    }

                    let result: Awaited<ReturnType<typeof updateProductMetadata>>;
                    try {
                        result = await updateProductMetadata({
                            countryCode: account.countryCode,
                            profileId: Number(account.profileId),
                            region: resolveApiRegion(account.countryCode),
                            asins,
                            skipSyncedAtOrAfter: new Date(job.data.refreshStartedAt),
                        });
                    } catch (error) {
                        recorder.setErrorEvent({
                            message: 'Product metadata refresh failed.',
                            payload: { trigger: 'weekly_refresh', requestedCount: asins.length, failureCount: 1, error: error instanceof Error ? error.message : String(error) },
                        });
                        throw error;
                    } finally {
                        emitEvent({ type: 'product-metadata:updated', accountId: account.adsAccountId, countryCode: account.countryCode });
                    }
                    recorder.addEvent({
                        ...buildProductMetadataEvent('Refreshed', result, { trigger: 'weekly_refresh' }),
                        accountId: account.adsAccountId,
                        countryCode: account.countryCode,
                    });
                }
            );
        }
    });

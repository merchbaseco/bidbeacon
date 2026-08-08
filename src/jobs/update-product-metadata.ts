import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { gateAccountWork } from '@/jobs/account-access-gate';
import { boss } from '@/jobs/boss';
import { resolveApiRegion, updateProductMetadata } from '@/services/product-metadata';
import { buildProductMetadataEvent } from '@/services/product-metadata-batches';
import { emitEvent } from '@/utils/events';
import { withJobMetrics } from '@/utils/job-metrics';

const jobInputSchema = z.object({
    accountId: z.string().min(1),
    countryCode: z.string().min(2),
    asins: z.array(z.string().min(1)).min(1),
});

export const updateProductMetadataJob = boss
    .createJob('update-product-metadata')
    .input(jobInputSchema)
    .retry({ limit: 3, delay: 60, backoff: true })
    .work(async jobs => {
        for (const job of jobs) {
            await withJobMetrics(
                {
                    jobName: 'update-product-metadata',
                    bossJobId: job.id,
                    input: job.data,
                    accountId: job.data.accountId,
                    countryCode: job.data.countryCode,
                },
                async recorder => {
                    if (!(await gateAccountWork({ accountId: job.data.accountId, countryCode: job.data.countryCode, recorder }))) return;

                    const account = await db.query.advertiserAccount.findFirst({
                        where: and(eq(advertiserAccount.adsAccountId, job.data.accountId), eq(advertiserAccount.countryCode, job.data.countryCode)),
                        columns: { profileId: true },
                    });
                    if (!account?.profileId) throw new Error(`Profile ID not found for account: ${job.data.accountId}`);

                    let result: Awaited<ReturnType<typeof updateProductMetadata>>;
                    try {
                        result = await updateProductMetadata({
                            countryCode: job.data.countryCode,
                            profileId: Number(account.profileId),
                            region: resolveApiRegion(job.data.countryCode),
                            asins: job.data.asins,
                            skipExisting: true,
                        });
                    } catch (error) {
                        recorder.setErrorEvent({
                            message: 'Product metadata update failed.',
                            payload: { trigger: 'new_asins', requestedCount: new Set(job.data.asins).size, failureCount: 1, error: error instanceof Error ? error.message : String(error) },
                        });
                        throw error;
                    } finally {
                        emitEvent({ type: 'product-metadata:updated', accountId: job.data.accountId, countryCode: job.data.countryCode });
                    }
                    recorder.addEvent(buildProductMetadataEvent('Updated', result, { trigger: 'new_asins' }));
                }
            );
        }
    });

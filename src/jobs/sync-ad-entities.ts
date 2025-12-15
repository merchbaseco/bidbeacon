/**
 * Job: Sync all Amazon Ads entities (campaigns, ad groups, ads, targets).
 * Creates exports for all 4 entity types in parallel, polls for completion,
 * downloads and parses the data, then inserts into the database.
 */

import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { and, eq, type InferInsertModel, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { exportAdGroups } from '@/amazon-ads/export-ad-groups.js';
import { exportAds } from '@/amazon-ads/export-ads.js';
import { exportCampaigns } from '@/amazon-ads/export-campaigns.js';
import { exportTargets } from '@/amazon-ads/export-targets.js';
import { type ExportContentType, type ExportStatusResponse, getExportStatus } from '@/amazon-ads/get-export-status.js';
import { db } from '@/db/index.js';
import { accountDatasetMetadata, ad, adGroup, advertiserAccount, campaign, target } from '@/db/schema.js';
import { boss } from '@/jobs/boss.js';
import { utcNow } from '@/utils/date.js';
import { emitEvent } from '@/utils/events.js';

const gunzipAsync = promisify(gunzip);

// ============================================================================
// Zod Schemas for Export Data Validation
// ============================================================================

// Campaign schema
const optimizationSchema = z.object({
    bidStrategy: z.string(),
    placementBidAdjustments: z.array(z.any()).optional(),
});

const monetaryBudgetSchema = z.object({
    currencyCode: z.string(),
    amount: z.number(),
});

const budgetValueSchema = z.object({
    monetaryBudget: monetaryBudgetSchema,
});

const budgetCapsSchema = z.object({
    recurrenceTimePeriod: z.string(),
    budgetType: z.string(),
    budgetValue: budgetValueSchema,
});

const campaignExportSchema = z.object({
    campaignId: z.string(),
    adProduct: z.string(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    state: z.string(),
    deliveryStatus: z.string(),
    deliveryReasons: z.array(z.string()).optional(),
    tags: z.array(z.any()).optional(),
    optimization: optimizationSchema.optional(),
    budgetCaps: budgetCapsSchema.optional(),
    targetingSettings: z.string(),
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
});

const campaignsExportSchema = z.array(campaignExportSchema);

// Ad Group schema
const adGroupBidSchema = z.object({
    defaultBid: z.number(),
    currencyCode: z.string(),
});

const adGroupExportSchema = z.object({
    adGroupId: z.string(),
    campaignId: z.string(),
    adProduct: z.string(),
    name: z.string(),
    state: z.string(),
    deliveryStatus: z.string(),
    deliveryReasons: z.array(z.string()).optional(),
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
    bid: adGroupBidSchema.optional(),
});

const adGroupsExportSchema = z.array(adGroupExportSchema);

// Ad schema
const productSchema = z.object({
    productIdType: z.string(),
    productId: z.string(), // This is the ASIN
});

const creativeSchema = z.object({
    products: z.array(productSchema),
});

const adExportSchema = z.object({
    adId: z.string(),
    adGroupId: z.string(),
    campaignId: z.string(),
    adProduct: z.string(),
    adType: z.string(),
    state: z.string(),
    deliveryStatus: z.string(),
    deliveryReasons: z.array(z.string()).optional(),
    creative: creativeSchema,
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
});

const adsExportSchema = z.array(adExportSchema);

// Target schema
const targetDetailsSchema = z.object({
    matchType: z.string(),
    asin: z.string().optional(),
    keyword: z.string().optional(),
});

const targetBidSchema = z.object({
    currencyCode: z.string(),
    bid: z.number(),
});

const targetExportSchema = z.object({
    adGroupId: z.string().optional(), // Optional because campaign-level targets don't have adGroupId
    campaignId: z.string(),
    targetId: z.string(),
    adProduct: z.string(),
    state: z.string(),
    negative: z.boolean(),
    bid: z.union([z.number(), targetBidSchema]).optional(),
    targetDetails: targetDetailsSchema,
    targetType: z.string(),
    targetLevel: z.string(),
    deliveryStatus: z.string(),
    deliveryReasons: z.array(z.string()).optional(),
    creationDateTime: z.string(),
    lastUpdatedDateTime: z.string(),
});

const targetsExportSchema = z.array(targetExportSchema);

// ============================================================================
// Job Input Schema
// ============================================================================

const jobInputSchema = z.object({
    accountId: z.string(),
    countryCode: z.string(),
});

// ============================================================================
// Helper Types
// ============================================================================

type EntityType = 'campaigns' | 'adGroups' | 'ads' | 'targets';

interface ExportState {
    entityType: EntityType;
    exportId: string;
    contentType: ExportContentType;
    status: ExportStatusResponse['status'];
    url?: string;
    error?: string;
}

// ============================================================================
// Polling Configuration
// ============================================================================

const POLL_INTERVAL_MS = 15000; // 15 seconds
const MAX_POLLS = 120; // 30 minutes max

// ============================================================================
// Job Definition
// ============================================================================

export const syncAdEntitiesJob = boss
    .createJob('sync-ad-entities')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            const { accountId, countryCode } = job.data;

            console.log(`[Sync Ad Entities] Starting job (ID: ${job.id}) for account: ${accountId}, country: ${countryCode}`);

            // Update metadata to indicate sync is starting
            await db
                .insert(accountDatasetMetadata)
                .values({
                    accountId,
                    countryCode,
                    status: 'syncing',
                    lastSyncStarted: utcNow(),
                    error: null,
                })
                .onConflictDoUpdate({
                    target: [accountDatasetMetadata.accountId, accountDatasetMetadata.countryCode],
                    set: {
                        status: 'syncing',
                        lastSyncStarted: utcNow(),
                        error: null,
                    },
                });

            // Emit event when metadata is updated
            emitEvent({
                type: 'account-dataset-metadata:updated',
                accountId,
                countryCode,
            });

            try {
                // Look up advertiser account to get profileId
                const account = await db.query.advertiserAccount.findFirst({
                    where: eq(advertiserAccount.adsAccountId, accountId),
                    columns: {
                        adsAccountId: true,
                        profileId: true,
                    },
                });

                if (!account) {
                    throw new Error(`Advertiser account not found: ${accountId}`);
                }

                if (!account.profileId) {
                    throw new Error(`Profile ID not found for account: ${accountId}`);
                }

                const profileId = Number(account.profileId);

                // Step 1: Create all exports in parallel
                console.log(`[Sync Ad Entities] Creating exports for all entity types...`);

                const [campaignsExport, adGroupsExport, adsExport, targetsExport] = await Promise.all([
                    exportCampaigns({
                        profileId,
                        adProductFilter: ['SPONSORED_PRODUCTS'],
                    }),
                    exportAdGroups({
                        profileId,
                        adProductFilter: ['SPONSORED_PRODUCTS'],
                    }),
                    exportAds({
                        profileId,
                        adProductFilter: ['SPONSORED_PRODUCTS'],
                    }),
                    exportTargets({
                        profileId,
                        adProductFilter: ['SPONSORED_PRODUCTS'],
                    }),
                ]);

                console.log(
                    `[Sync Ad Entities] Created exports: campaigns=${campaignsExport.exportId}, adGroups=${adGroupsExport.exportId}, ads=${adsExport.exportId}, targets=${targetsExport.exportId}`
                );

                // Initialize export states
                const exports: ExportState[] = [
                    {
                        entityType: 'campaigns',
                        exportId: campaignsExport.exportId,
                        contentType: 'application/vnd.campaignsexport.v1+json',
                        status: campaignsExport.status,
                        url: campaignsExport.url,
                    },
                    {
                        entityType: 'adGroups',
                        exportId: adGroupsExport.exportId,
                        contentType: 'application/vnd.adgroupsexport.v1+json',
                        status: adGroupsExport.status,
                        url: adGroupsExport.url,
                    },
                    {
                        entityType: 'ads',
                        exportId: adsExport.exportId,
                        contentType: 'application/vnd.adsexport.v1+json',
                        status: adsExport.status,
                        url: adsExport.url,
                    },
                    {
                        entityType: 'targets',
                        exportId: targetsExport.exportId,
                        contentType: 'application/vnd.targetsexport.v1+json',
                        status: targetsExport.status,
                        url: targetsExport.url,
                    },
                ];

                // Step 2: Poll for all exports to complete
                console.log(`[Sync Ad Entities] Polling for export completion...`);

                let pollCount = 0;
                while (pollCount < MAX_POLLS) {
                    const pendingExports = exports.filter(e => e.status === 'PROCESSING');

                    if (pendingExports.length === 0) {
                        break;
                    }

                    console.log(`[Sync Ad Entities] Poll ${pollCount + 1}/${MAX_POLLS}: ${pendingExports.length} exports still processing`);

                    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

                    // Poll all pending exports in parallel
                    await Promise.all(
                        pendingExports.map(async exportState => {
                            const status = await getExportStatus(
                                {
                                    profileId,
                                    exportId: exportState.exportId,
                                    contentType: exportState.contentType,
                                },
                                'na'
                            );

                            exportState.status = status.status;
                            exportState.url = status.url;

                            if (status.status === 'FAILED') {
                                exportState.error = status.error?.message ?? 'Unknown error';
                                console.error(`[Sync Ad Entities] Export failed for ${exportState.entityType}: ${exportState.error}`);
                            } else if (status.status === 'COMPLETED') {
                                console.log(`[Sync Ad Entities] Export completed for ${exportState.entityType}`);
                            }
                        })
                    );

                    pollCount++;
                }

                // Check for failures
                const failedExports = exports.filter(e => e.status === 'FAILED');
                if (failedExports.length > 0) {
                    throw new Error(`Exports failed: ${failedExports.map(e => `${e.entityType}: ${e.error}`).join(', ')}`);
                }

                const incompleteExports = exports.filter(e => e.status !== 'COMPLETED');
                if (incompleteExports.length > 0) {
                    throw new Error(`Exports did not complete within timeout: ${incompleteExports.map(e => e.entityType).join(', ')}`);
                }

                // Step 3: Download and parse all exports in parallel
                console.log(`[Sync Ad Entities] Downloading and parsing export data...`);

                // Helper to get URL safely (we've already verified all exports are COMPLETED)
                const getExportUrl = (entityType: EntityType): string => {
                    const exportState = exports.find(e => e.entityType === entityType);
                    if (!exportState?.url) {
                        throw new Error(`Missing URL for ${entityType} export`);
                    }
                    return exportState.url;
                };

                const [campaignsData, adGroupsData, adsData, targetsData] = await Promise.all([
                    downloadAndParse(getExportUrl('campaigns'), campaignsExportSchema),
                    downloadAndParse(getExportUrl('adGroups'), adGroupsExportSchema),
                    downloadAndParse(getExportUrl('ads'), adsExportSchema),
                    downloadAndParse(getExportUrl('targets'), targetsExportSchema),
                ]);

                console.log(`[Sync Ad Entities] Parsed: ${campaignsData.length} campaigns, ${adGroupsData.length} ad groups, ${adsData.length} ads, ${targetsData.length} targets`);

                // Step 4: Transform and insert into database
                console.log(`[Sync Ad Entities] Inserting data into database...`);

                // Extract IDs from export data to scope deletions to this account only
                const campaignIds = campaignsData.map(c => c.campaignId);
                const adGroupIds = adGroupsData.map(ag => ag.adGroupId);
                const adIds = adsData.map(a => a.adId);
                const targetIds = targetsData.map(t => t.targetId);

                await db.transaction(async tx => {
                    // Delete existing data for this account only (scoped to exported IDs)
                    // Delete in reverse dependency order to respect foreign key constraints
                    if (targetIds.length > 0) {
                        await tx.delete(target).where(inArray(target.targetId, targetIds));
                        console.log(`[Sync Ad Entities] Deleted ${targetIds.length} targets`);
                    }
                    if (adIds.length > 0) {
                        await tx.delete(ad).where(inArray(ad.adId, adIds));
                        console.log(`[Sync Ad Entities] Deleted ${adIds.length} ads`);
                    }
                    if (adGroupIds.length > 0) {
                        await tx.delete(adGroup).where(inArray(adGroup.adGroupId, adGroupIds));
                        console.log(`[Sync Ad Entities] Deleted ${adGroupIds.length} ad groups`);
                    }
                    if (campaignIds.length > 0) {
                        await tx.delete(campaign).where(inArray(campaign.campaignId, campaignIds));
                        console.log(`[Sync Ad Entities] Deleted ${campaignIds.length} campaigns`);
                    }

                    // Insert campaigns
                    if (campaignsData.length > 0) {
                        const campaignRecords: InferInsertModel<typeof campaign>[] = campaignsData.map(c => ({
                            id: c.campaignId,
                            campaignId: c.campaignId,
                            accountId,
                            countryCode,
                            name: c.name,
                            adProduct: c.adProduct,
                            state: c.state,
                            deliveryStatus: c.deliveryStatus,
                            startDate: c.startDate,
                            endDate: c.endDate ?? null,
                            targetingSettings: c.targetingSettings,
                            bidStrategy: c.optimization?.bidStrategy ?? null,
                            budgetType: c.budgetCaps?.budgetType ?? null,
                            budgetPeriod: c.budgetCaps?.recurrenceTimePeriod ?? null,
                            budgetAmount: c.budgetCaps?.budgetValue?.monetaryBudget?.amount?.toString() ?? null,
                            creationDateTime: new Date(c.creationDateTime),
                            lastUpdatedDateTime: new Date(c.lastUpdatedDateTime),
                        }));

                        await batchInsert(tx, campaign, campaignRecords);
                        console.log(`[Sync Ad Entities] Inserted ${campaignRecords.length} campaigns`);
                    }

                    // Insert ad groups
                    if (adGroupsData.length > 0) {
                        const adGroupRecords: InferInsertModel<typeof adGroup>[] = adGroupsData.map(ag => ({
                            id: ag.adGroupId,
                            adGroupId: ag.adGroupId,
                            campaignId: ag.campaignId,
                            name: ag.name,
                            adProduct: ag.adProduct,
                            state: ag.state,
                            deliveryStatus: ag.deliveryStatus,
                            bidAmount: ag.bid?.defaultBid?.toString() ?? null,
                            creationDateTime: new Date(ag.creationDateTime),
                            lastUpdatedDateTime: new Date(ag.lastUpdatedDateTime),
                        }));

                        await batchInsert(tx, adGroup, adGroupRecords);
                        console.log(`[Sync Ad Entities] Inserted ${adGroupRecords.length} ad groups`);
                    }

                    // Insert ads
                    if (adsData.length > 0) {
                        const adRecords: InferInsertModel<typeof ad>[] = adsData.map(a => ({
                            id: a.adId,
                            adId: a.adId,
                            adGroupId: a.adGroupId,
                            campaignId: a.campaignId,
                            adProduct: a.adProduct,
                            adType: a.adType,
                            state: a.state,
                            deliveryStatus: a.deliveryStatus,
                            productAsin: a.creative.products[0]?.productId ?? null,
                            creationDateTime: new Date(a.creationDateTime),
                            lastUpdatedDateTime: new Date(a.lastUpdatedDateTime),
                        }));

                        await batchInsert(tx, ad, adRecords);
                        console.log(`[Sync Ad Entities] Inserted ${adRecords.length} ads`);
                    }

                    // Insert targets
                    if (targetsData.length > 0) {
                        const targetRecords: InferInsertModel<typeof target>[] = targetsData.map(t => {
                            // Handle bid amount - could be number or bid object with currencyCode and bid
                            let bidAmount: string | null = null;
                            if (t.bid !== undefined) {
                                if (typeof t.bid === 'number') {
                                    bidAmount = t.bid.toString();
                                } else if (typeof t.bid === 'object' && t.bid !== null) {
                                    bidAmount = t.bid.bid.toString();
                                }
                            }

                            return {
                                id: t.targetId,
                                campaignId: t.campaignId,
                                targetId: t.targetId,
                                adGroupId: t.adGroupId ?? null,
                                adProduct: t.adProduct,
                                state: t.state,
                                negative: t.negative,
                                bidAmount,
                                targetMatchType: t.targetDetails.matchType,
                                targetAsin: t.targetDetails.asin ?? null,
                                targetKeyword: t.targetDetails.keyword ?? null,
                                targetType: t.targetType,
                                deliveryStatus: t.deliveryStatus,
                                creationDateTime: new Date(t.creationDateTime),
                                lastUpdatedDateTime: new Date(t.lastUpdatedDateTime),
                            };
                        });

                        await batchInsert(tx, target, targetRecords);
                        console.log(`[Sync Ad Entities] Inserted ${targetRecords.length} targets`);
                    }
                });

                // Update metadata with success
                await db
                    .update(accountDatasetMetadata)
                    .set({
                        status: 'completed',
                        lastSyncCompleted: utcNow(),
                        campaignsCount: campaignsData.length,
                        adGroupsCount: adGroupsData.length,
                        adsCount: adsData.length,
                        targetsCount: targetsData.length,
                        error: null,
                    })
                    .where(and(eq(accountDatasetMetadata.accountId, accountId), eq(accountDatasetMetadata.countryCode, countryCode)));

                // Emit event when metadata is updated
                emitEvent({
                    type: 'account-dataset-metadata:updated',
                    accountId,
                    countryCode,
                });

                console.log(`[Sync Ad Entities] Completed job (ID: ${job.id}) for account: ${accountId}, country: ${countryCode}`);
            } catch (error) {
                // Update metadata with error
                await db
                    .update(accountDatasetMetadata)
                    .set({
                        status: 'failed',
                        error: error instanceof Error ? error.message : 'Unknown error',
                    })
                    .where(and(eq(accountDatasetMetadata.accountId, accountId), eq(accountDatasetMetadata.countryCode, countryCode)));

                // Emit event when metadata is updated
                emitEvent({
                    type: 'account-dataset-metadata:updated',
                    accountId,
                    countryCode,
                });

                console.error(`[Sync Ad Entities] Failed job (ID: ${job.id}) for account: ${accountId}, country: ${countryCode}:`, error);
                throw error;
            }
        }
    });

// ============================================================================
// Helper Functions
// ============================================================================

async function downloadAndParse<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download export: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();
    const decompressedData = await gunzipAsync(Buffer.from(compressedData));
    const rawJson = JSON.parse(decompressedData.toString());

    return schema.parse(rawJson);
}

async function batchInsert<T extends Record<string, unknown>>(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    table: Parameters<typeof tx.insert>[0],
    records: T[],
    batchSize = 100
): Promise<void> {
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await tx.insert(table).values(batch as any);
    }
}

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
import { withJobSession } from '@/utils/job-events.js';

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
    adGroupId: z.string().optional(), // Optional because campaign-level negative targets don't have adGroupId
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
const MAX_POLLS = 20; // 5 minutes max

// ============================================================================
// Job Definition
// ============================================================================

export const syncAdEntitiesJob = boss
    .createJob('sync-ad-entities')
    .input(jobInputSchema)
    .work(async jobs => {
        for (const job of jobs) {
            const { accountId, countryCode } = job.data;

            await withJobSession(
                {
                    jobName: 'sync-ad-entities',
                    bossJobId: job.id,
                    context: {
                        accountId,
                        countryCode,
                    },
                },
                async recorder => {
                    // Update metadata to indicate sync is starting
                    await db
                        .insert(accountDatasetMetadata)
                        .values({
                            accountId,
                            countryCode,
                            lastSyncStarted: utcNow(),
                            error: null,
                            fetchingCampaigns: true,
                            fetchingCampaignsPollCount: 0,
                            fetchingAdGroups: true,
                            fetchingAdGroupsPollCount: 0,
                            fetchingAds: true,
                            fetchingAdsPollCount: 0,
                            fetchingTargets: true,
                            fetchingTargetsPollCount: 0,
                        })
                        .onConflictDoUpdate({
                            target: [accountDatasetMetadata.accountId, accountDatasetMetadata.countryCode],
                            set: {
                                lastSyncStarted: utcNow(),
                                error: null,
                                fetchingCampaigns: true,
                                fetchingCampaignsPollCount: 0,
                                fetchingAdGroups: true,
                                fetchingAdGroupsPollCount: 0,
                                fetchingAds: true,
                                fetchingAdsPollCount: 0,
                                fetchingTargets: true,
                                fetchingTargetsPollCount: 0,
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
                                    let pollCount = 0;
                                    while (pollCount < MAX_POLLS) {
                                        const pendingExports = exports.filter(e => e.status === 'PROCESSING');

                                        if (pendingExports.length === 0) {
                                            break;
                                        }

                                        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

                                        // Track which exports just completed this poll cycle
                                        const justCompleted: EntityType[] = [];

                                        // Poll all pending exports in parallel
                                        await Promise.all(
                                            pendingExports.map(async exportState => {
                                                const previousStatus = exportState.status;
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
                                                    await recorder.event({
                                                        eventType: 'entity-sync',
                                                        message: `Export failed for ${exportState.entityType}`,
                                                        detail: exportState.error ?? undefined,
                                                        context: { accountId, countryCode },
                                                    });
                                                }

                                                // Track if this export just completed
                                                if (previousStatus === 'PROCESSING' && status.status === 'COMPLETED') {
                                                    justCompleted.push(exportState.entityType);
                                                }
                                            })
                                        );

                                        pollCount++;

                                        // Update poll counts and fetching flags for each export type
                                        const updateData: Partial<{
                                            fetchingCampaigns: boolean;
                                            fetchingCampaignsPollCount: number;
                                            fetchingAdGroups: boolean;
                                            fetchingAdGroupsPollCount: number;
                                            fetchingAds: boolean;
                                            fetchingAdsPollCount: number;
                                            fetchingTargets: boolean;
                                            fetchingTargetsPollCount: number;
                                        }> = {};

                                        const campaignsExport = exports.find(e => e.entityType === 'campaigns');
                                        if (campaignsExport?.status === 'PROCESSING') {
                                            updateData.fetchingCampaignsPollCount = pollCount;
                                        }
                                        if (justCompleted.includes('campaigns')) {
                                            updateData.fetchingCampaigns = false;
                                        }

                                        const adGroupsExport = exports.find(e => e.entityType === 'adGroups');
                                        if (adGroupsExport?.status === 'PROCESSING') {
                                            updateData.fetchingAdGroupsPollCount = pollCount;
                                        }
                                        if (justCompleted.includes('adGroups')) {
                                            updateData.fetchingAdGroups = false;
                                        }

                                        const adsExport = exports.find(e => e.entityType === 'ads');
                                        if (adsExport?.status === 'PROCESSING') {
                                            updateData.fetchingAdsPollCount = pollCount;
                                        }
                                        if (justCompleted.includes('ads')) {
                                            updateData.fetchingAds = false;
                                        }

                                        const targetsExport = exports.find(e => e.entityType === 'targets');
                                        if (targetsExport?.status === 'PROCESSING') {
                                            updateData.fetchingTargetsPollCount = pollCount;
                                        }
                                        if (justCompleted.includes('targets')) {
                                            updateData.fetchingTargets = false;
                                        }

                                        if (Object.keys(updateData).length > 0) {
                                            await db
                                                .update(accountDatasetMetadata)
                                                .set(updateData)
                                                .where(and(eq(accountDatasetMetadata.accountId, accountId), eq(accountDatasetMetadata.countryCode, countryCode)));

                                            // Emit event when metadata is updated
                                            emitEvent({
                                                type: 'account-dataset-metadata:updated',
                                                accountId,
                                                countryCode,
                                            });
                                        }
                                    }

                                    // Check for failures
                                    const failedExports = exports.filter(e => e.status === 'FAILED');
                                    if (failedExports.length > 0) {
                                        // Set fetching flags to false for failed exports
                                        const updateData: Partial<{
                                            fetchingCampaigns: boolean;
                                            fetchingAdGroups: boolean;
                                            fetchingAds: boolean;
                                            fetchingTargets: boolean;
                                        }> = {};

                                        if (failedExports.some(e => e.entityType === 'campaigns')) {
                                            updateData.fetchingCampaigns = false;
                                        }
                                        if (failedExports.some(e => e.entityType === 'adGroups')) {
                                            updateData.fetchingAdGroups = false;
                                        }
                                        if (failedExports.some(e => e.entityType === 'ads')) {
                                            updateData.fetchingAds = false;
                                        }
                                        if (failedExports.some(e => e.entityType === 'targets')) {
                                            updateData.fetchingTargets = false;
                                        }

                                        if (Object.keys(updateData).length > 0) {
                                            await db
                                                .update(accountDatasetMetadata)
                                                .set(updateData)
                                                .where(and(eq(accountDatasetMetadata.accountId, accountId), eq(accountDatasetMetadata.countryCode, countryCode)));

                                            emitEvent({
                                                type: 'account-dataset-metadata:updated',
                                                accountId,
                                                countryCode,
                                            });
                                        }

                                        throw new Error(`Exports failed: ${failedExports.map(e => `${e.entityType}: ${e.error}`).join(', ')}`);
                                    }

                                    const incompleteExports = exports.filter(e => e.status !== 'COMPLETED');
                                    if (incompleteExports.length > 0) {
                                        // Set fetching flags to false for incomplete exports
                                        const updateData: Partial<{
                                            fetchingCampaigns: boolean;
                                            fetchingAdGroups: boolean;
                                            fetchingAds: boolean;
                                            fetchingTargets: boolean;
                                        }> = {};

                                        if (incompleteExports.some(e => e.entityType === 'campaigns')) {
                                            updateData.fetchingCampaigns = false;
                                        }
                                        if (incompleteExports.some(e => e.entityType === 'adGroups')) {
                                            updateData.fetchingAdGroups = false;
                                        }
                                        if (incompleteExports.some(e => e.entityType === 'ads')) {
                                            updateData.fetchingAds = false;
                                        }
                                        if (incompleteExports.some(e => e.entityType === 'targets')) {
                                            updateData.fetchingTargets = false;
                                        }

                                        if (Object.keys(updateData).length > 0) {
                                            await db
                                                .update(accountDatasetMetadata)
                                                .set(updateData)
                                                .where(and(eq(accountDatasetMetadata.accountId, accountId), eq(accountDatasetMetadata.countryCode, countryCode)));

                                            emitEvent({
                                                type: 'account-dataset-metadata:updated',
                                                accountId,
                                                countryCode,
                                            });
                                        }

                                        throw new Error(`Exports did not complete within timeout: ${incompleteExports.map(e => e.entityType).join(', ')}`);
                                    }

                                    // Step 3: Download and parse all exports in parallel
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

                                    // Update metadata to indicate downloads are complete (set fetching flags to false)
                                    await db
                                        .update(accountDatasetMetadata)
                                        .set({
                                            fetchingCampaigns: false,
                                            fetchingAdGroups: false,
                                            fetchingAds: false,
                                            fetchingTargets: false,
                                        })
                                        .where(and(eq(accountDatasetMetadata.accountId, accountId), eq(accountDatasetMetadata.countryCode, countryCode)));

                                    // Emit event when metadata is updated
                                    emitEvent({
                                        type: 'account-dataset-metadata:updated',
                                        accountId,
                                        countryCode,
                                    });

                                    // Step 4: Transform and insert into database
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
                                        }
                                        if (adIds.length > 0) {
                                            await tx.delete(ad).where(inArray(ad.adId, adIds));
                                        }
                                        if (adGroupIds.length > 0) {
                                            await tx.delete(adGroup).where(inArray(adGroup.adGroupId, adGroupIds));
                                        }
                                        if (campaignIds.length > 0) {
                                            await tx.delete(campaign).where(inArray(campaign.campaignId, campaignIds));
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
                                        }
                                    });

                                        // Update metadata with success
                                        await db
                                            .update(accountDatasetMetadata)
                                            .set({
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

                                        const syncTotals = {
                                            campaigns: campaignsData.length,
                                            adGroups: adGroupsData.length,
                                            ads: adsData.length,
                                            targets: targetsData.length,
                                        };
                                        const totalRecords = syncTotals.campaigns + syncTotals.adGroups + syncTotals.ads + syncTotals.targets;

                                        await recorder.event({
                                            eventType: 'entity-sync',
                                            message: `Imported ${syncTotals.campaigns} campaigns, ${syncTotals.adGroups} ad groups, ${syncTotals.ads} ads, ${syncTotals.targets} targets`,
                                            detail: 'Account entity sync completed successfully',
                                            context: { accountId, countryCode },
                                        });

                                        recorder.setFinalFields({
                                            recordsProcessed: totalRecords,
                                            metadata: syncTotals,
                                        });
                } catch (error) {
                    // Update metadata with error
                    await db
                        .update(accountDatasetMetadata)
                        .set({
                            error: error instanceof Error ? error.message : 'Unknown error',
                        })
                        .where(and(eq(accountDatasetMetadata.accountId, accountId), eq(accountDatasetMetadata.countryCode, countryCode)));

                    // Emit event when metadata is updated
                    emitEvent({
                        type: 'account-dataset-metadata:updated',
                        accountId,
                        countryCode,
                    });

                    recorder.markFailure(error instanceof Error ? error.message : String(error));
                    throw error;
                }
            });
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

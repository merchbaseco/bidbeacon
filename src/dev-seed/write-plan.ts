import { eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import {
    accountDatasetMetadata,
    ad,
    adGroup,
    advertiserAccount,
    amsMetrics,
    apiMetrics,
    campaign,
    changeHistorySyncState,
    entityChangeHistory,
    events,
    jobMetrics,
    performanceAnnual,
    performanceDaily,
    performanceHourly,
    performanceMonthly,
    reportDatasetMetadata,
    target,
    userAccountAccess,
    userPreferences,
} from '@/db/schema';
import { SEED_UUID_LIKE_PATTERN } from './seed-ids';
import type { DevSeedPlan } from './types';

/**
 * Writes a plan into a local database.
 *
 * Idempotent by construction: everything the previous run wrote is cleared and
 * refilled inside one transaction, so a re-run refreshes the week instead of
 * stacking a second one on top of it, and a failed run leaves the previous
 * dataset intact.
 *
 * "Everything the previous run wrote" is scoped two ways. Account-scoped tables
 * are cleared by the seeded account; `api_metrics`, `ams_metrics`, and
 * `job_metrics` have no account column, so those rows carry a reserved id
 * prefix and are cleared by it. Nothing else in the local database is touched.
 */

export type SeedDatabase = PgDatabase<PgQueryResultHKT>;

const INSERT_CHUNK_SIZE = 500;

export const writeDevSeedPlan = async (database: SeedDatabase, plan: DevSeedPlan) => {
    await database.transaction(async tx => {
        await clearPreviousRun(tx as SeedDatabase, plan);

        await insertRows(tx as SeedDatabase, advertiserAccount, plan.rows.advertiserAccount);
        await insertRows(tx as SeedDatabase, userAccountAccess, plan.rows.userAccountAccess);

        // The developer's own preference row is upserted rather than cleared:
        // it is the one seeded row that belongs to a person, not to the dataset.
        for (const preference of plan.rows.userPreferences) {
            await tx
                .insert(userPreferences)
                .values(preference)
                .onConflictDoUpdate({
                    set: { selectedAdsAccountId: preference.selectedAdsAccountId, selectedProfileId: preference.selectedProfileId, updatedAt: preference.updatedAt },
                    target: userPreferences.merchbaseUserId,
                });
        }

        await insertRows(tx as SeedDatabase, campaign, plan.rows.campaign);
        await insertRows(tx as SeedDatabase, adGroup, plan.rows.adGroup);
        await insertRows(tx as SeedDatabase, ad, plan.rows.ad);
        await insertRows(tx as SeedDatabase, target, plan.rows.target);
        await insertRows(tx as SeedDatabase, performanceDaily, plan.rows.performanceDaily);
        await insertRows(tx as SeedDatabase, performanceHourly, plan.rows.performanceHourly);
        await insertRows(tx as SeedDatabase, accountDatasetMetadata, plan.rows.accountDatasetMetadata);
        await insertRows(tx as SeedDatabase, reportDatasetMetadata, plan.rows.reportDatasetMetadata);
        await insertRows(tx as SeedDatabase, entityChangeHistory, plan.rows.entityChangeHistory);
        await insertRows(tx as SeedDatabase, changeHistorySyncState, plan.rows.changeHistorySyncState);
        await insertRows(tx as SeedDatabase, jobMetrics, plan.rows.jobMetrics);
        await insertRows(tx as SeedDatabase, events, plan.rows.events);
        await insertRows(tx as SeedDatabase, apiMetrics, plan.rows.apiMetrics);
        await insertRows(tx as SeedDatabase, amsMetrics, plan.rows.amsMetrics);
    });
};

const clearPreviousRun = async (tx: SeedDatabase, plan: DevSeedPlan) => {
    const accountId = plan.accountId;

    await tx.delete(performanceHourly).where(eq(performanceHourly.accountId, accountId));
    await tx.delete(performanceDaily).where(eq(performanceDaily.accountId, accountId));
    await tx.delete(performanceMonthly).where(eq(performanceMonthly.accountId, accountId));
    await tx.delete(performanceAnnual).where(eq(performanceAnnual.accountId, accountId));

    await tx.delete(entityChangeHistory).where(eq(entityChangeHistory.accountId, accountId));
    await tx.delete(changeHistorySyncState).where(eq(changeHistorySyncState.accountId, accountId));
    await tx.delete(reportDatasetMetadata).where(eq(reportDatasetMetadata.accountId, accountId));
    await tx.delete(accountDatasetMetadata).where(eq(accountDatasetMetadata.accountId, accountId));

    await tx.delete(events).where(eq(events.accountId, accountId));
    await tx.delete(jobMetrics).where(sql`${jobMetrics.id}::text like ${SEED_UUID_LIKE_PATTERN}`);
    await tx.delete(apiMetrics).where(sql`${apiMetrics.id}::text like ${SEED_UUID_LIKE_PATTERN}`);
    await tx.delete(amsMetrics).where(sql`${amsMetrics.id}::text like ${SEED_UUID_LIKE_PATTERN}`);

    // Ad groups, ads, and targets hang off the campaign rather than the
    // account, so they are cleared through the account's campaigns.
    const seededCampaigns = await tx.select({ campaignId: campaign.campaignId }).from(campaign).where(eq(campaign.accountId, accountId));
    const campaignIds = seededCampaigns.map(row => row.campaignId);
    if (campaignIds.length > 0) {
        await tx.delete(target).where(inArray(target.campaignId, campaignIds));
        await tx.delete(ad).where(inArray(ad.campaignId, campaignIds));
        await tx.delete(adGroup).where(inArray(adGroup.campaignId, campaignIds));
    }
    await tx.delete(campaign).where(eq(campaign.accountId, accountId));

    // Cascades to the account's `user_account_access` grants.
    await tx.delete(advertiserAccount).where(eq(advertiserAccount.adsAccountId, accountId));
};

const insertRows = async <T extends Record<string, unknown>>(tx: SeedDatabase, table: Parameters<SeedDatabase['insert']>[0], rows: T[]) => {
    for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
        // Deliberately not `onConflictDoNothing`: after the clear, a conflict
        // means the plan collides with rows this seed does not own, and a dev
        // fixture that silently drops half its dataset is worse than one that
        // stops and says so.
        await tx.insert(table).values(rows.slice(index, index + INSERT_CHUNK_SIZE) as never);
    }
};

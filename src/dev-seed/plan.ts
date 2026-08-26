import { DEV_SIGN_IN_MERCHBASE_USER_ID } from '@merchbaseco/access/dev';
import { getTimezoneForCountry } from '@/utils/timezones';
import { buildAdStructure } from './build-ad-structure';
import { buildIngestionState } from './build-ingestion-state';
import { buildPerformance } from './build-performance';
import { buildTelemetry } from './build-telemetry';
import { createSeededRandom } from './random';
import { createSeedIds } from './seed-ids';
import type { DevSeedOptions, DevSeedPlan } from './types';

/**
 * Builds the whole synthetic dataset in memory. The plan is a pure function of
 * the seed string and the current time, which is what makes runs reproducible
 * while still always describing this week.
 */

export const DEFAULT_SEED_OPTIONS = {
    accountId: 'amzn1.ads-account.g.dev5eedcedarcoil0000000001',
    accountName: 'Cedar & Coil (dev seed)',
    campaignCount: 6,
    countryCode: 'US',
    dayCount: 14,
    // The shared Merchbase Dev Sign-In user, so the account the auto sign-in
    // flow lands on is the account this data belongs to. The value comes from
    // `@merchbaseco/access/dev` rather than a local literal: the same constant
    // is what `bootstrapDevAccessProjection` writes into the Access Projection,
    // and two copies of it could drift into a signed-in user who owns nothing.
    merchbaseUserId: DEV_SIGN_IN_MERCHBASE_USER_ID,
    seed: 'bidbeacon-dev',
} as const;

export const buildDevSeedPlan = (options: DevSeedOptions): DevSeedPlan => {
    const random = createSeededRandom(options.seed);
    const ids = createSeedIds();
    const timezone = getTimezoneForCountry(options.countryCode);
    const advertiserAccountId = ids.next();
    const profileId = String(random.int(1_000_000_000_000, 9_999_999_999_999));

    const structure = buildAdStructure({
        accountId: options.accountId,
        campaignCount: options.campaignCount,
        countryCode: options.countryCode,
        now: options.now,
        random,
        timezone,
    });

    const performance = buildPerformance({
        accountId: options.accountId,
        dayCount: options.dayCount,
        now: options.now,
        random,
        targets: structure.servingTargets,
        timezone,
    });

    const ingestion = buildIngestionState({
        accountId: options.accountId,
        countryCode: options.countryCode,
        dayCount: options.dayCount,
        now: options.now,
        random,
        structure,
        timezone,
    });

    const telemetry = buildTelemetry({
        accountId: options.accountId,
        countryCode: options.countryCode,
        ids,
        now: options.now,
        random,
    });

    const rows: DevSeedPlan['rows'] = {
        accountDatasetMetadata: ingestion.accountDatasetMetadata,
        ad: structure.ads,
        adGroup: structure.adGroups,
        advertiserAccount: [
            {
                accountName: options.accountName,
                adsAccountId: options.accountId,
                countryCode: options.countryCode,
                enabled: true,
                entityId: `ENTITY${profileId.slice(0, 8)}`,
                id: advertiserAccountId,
                profileId,
                status: 'CREATED',
            },
        ],
        amsMetrics: telemetry.amsMetrics,
        apiMetrics: telemetry.apiMetrics,
        campaign: structure.campaigns,
        changeHistorySyncState: ingestion.changeHistorySync,
        entityChangeHistory: ingestion.changeHistory,
        events: telemetry.events,
        jobMetrics: telemetry.jobMetrics,
        performanceDaily: performance.daily,
        performanceHourly: performance.hourly,
        reportDatasetMetadata: ingestion.reportDatasetMetadata,
        target: structure.targets,
        userAccountAccess: [
            {
                adsAccountId: options.accountId,
                advertiserAccountId,
                merchbaseUserId: options.merchbaseUserId,
            },
        ],
        userPreferences: [
            {
                merchbaseUserId: options.merchbaseUserId,
                selectedAdsAccountId: options.accountId,
                selectedProfileId: profileId,
                updatedAt: options.now,
            },
        ],
    };

    // Read back off the rows rather than recomputed from `now`, so the window
    // the seed reports is the window it actually wrote.
    const dayLabels = [...new Set(performance.daily.map(row => String(row.bucketDate)))].sort();

    return {
        accountId: options.accountId,
        advertiserAccountId,
        countryCode: options.countryCode,
        fromDay: dayLabels[0] ?? null,
        merchbaseUserId: options.merchbaseUserId,
        rows,
        summary: Object.fromEntries(Object.entries(rows).map(([table, tableRows]) => [table, tableRows.length])),
        throughDay: dayLabels.at(-1) ?? null,
        timezone,
    };
};

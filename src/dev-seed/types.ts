import type { InferInsertModel } from 'drizzle-orm';
import type {
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
    performanceDaily,
    performanceHourly,
    reportDatasetMetadata,
    target,
    userAccountAccess,
    userPreferences,
} from '@/db/schema';

/**
 * Row shapes for the synthetic dev dataset, inferred straight from the Drizzle
 * schema so a column change breaks the seed at compile time rather than at
 * `insert`.
 */

export interface DevSeedOptions {
    /** Amazon-style ads account id every row is scoped to. */
    accountId: string;
    accountName: string;
    campaignCount: number;
    countryCode: string;
    /** Days of daily performance history, ending today. */
    dayCount: number;
    /** Stable Merchbase user the seeded account is granted to. */
    merchbaseUserId: string;
    now: Date;
    seed: string;
}

/** An ad group's target, carried between builders with its demand weight. */
export interface SeedTarget {
    adGroupId: string;
    adId: string;
    campaignId: string;
    /** Bid in account currency, used for spend as well as the stored bid. */
    bidAmount: number;
    /** Conversion rate applied to clicks. */
    conversionRate: number;
    negative: boolean;
    /** Long-tail demand weight before day and hour factors. */
    salesWeight: number;
    /** Days before the run when the target started serving. */
    startDayOffset: number;
    state: string;
    targetId: string;
    /** Revenue per purchase in account currency. */
    unitPrice: number;
}

export interface SeedAdStructure {
    ads: InferInsertModel<typeof ad>[];
    adGroups: InferInsertModel<typeof adGroup>[];
    campaigns: InferInsertModel<typeof campaign>[];
    targets: InferInsertModel<typeof target>[];
    /** The serving targets, with the weights the performance builder needs. */
    servingTargets: SeedTarget[];
}

export interface DevSeedPlan {
    accountId: string;
    advertiserAccountId: string;
    countryCode: string;
    /** Oldest day of daily performance, in the account's reporting timezone. */
    fromDay: string | null;
    merchbaseUserId: string;
    rows: {
        accountDatasetMetadata: InferInsertModel<typeof accountDatasetMetadata>[];
        ad: InferInsertModel<typeof ad>[];
        adGroup: InferInsertModel<typeof adGroup>[];
        advertiserAccount: InferInsertModel<typeof advertiserAccount>[];
        amsMetrics: InferInsertModel<typeof amsMetrics>[];
        apiMetrics: InferInsertModel<typeof apiMetrics>[];
        campaign: InferInsertModel<typeof campaign>[];
        changeHistorySyncState: InferInsertModel<typeof changeHistorySyncState>[];
        entityChangeHistory: InferInsertModel<typeof entityChangeHistory>[];
        events: InferInsertModel<typeof events>[];
        jobMetrics: InferInsertModel<typeof jobMetrics>[];
        performanceDaily: InferInsertModel<typeof performanceDaily>[];
        performanceHourly: InferInsertModel<typeof performanceHourly>[];
        reportDatasetMetadata: InferInsertModel<typeof reportDatasetMetadata>[];
        target: InferInsertModel<typeof target>[];
        userAccountAccess: InferInsertModel<typeof userAccountAccess>[];
        userPreferences: InferInsertModel<typeof userPreferences>[];
    };
    /** Row counts per table. */
    summary: Record<string, number>;
    /** Newest day of daily performance — always today in that timezone. */
    throughDay: string | null;
    timezone: string;
}

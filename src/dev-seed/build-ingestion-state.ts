import { formatInTimeZone } from 'date-fns-tz';
import type { InferInsertModel } from 'drizzle-orm';
import type { accountDatasetMetadata, changeHistorySyncState, entityChangeHistory, reportDatasetMetadata } from '@/db/schema';
import { zonedAddHours, zonedStartOfDay, zonedSubtractDays, zonedSubtractHours, zonedTopOfHour } from '@/utils/date';
import type { SeededRandom } from './random';
import type { SeedAdStructure } from './types';

/**
 * The ingestion state behind the reports table, the account data card, and the
 * bid-history dialog: which report datasets exist and where each one is in the
 * report state machine, when entities were last exported, and the optimisation
 * changes recorded against campaigns and targets.
 *
 * Statuses are spread across the state machine on purpose. A table where every
 * row says "completed" proves nothing about the status chips, the refresh
 * button, or the error surface.
 */

type AccountDatasetMetadataRow = InferInsertModel<typeof accountDatasetMetadata>;
type ChangeHistorySyncStateRow = InferInsertModel<typeof changeHistorySyncState>;
type EntityChangeHistoryRow = InferInsertModel<typeof entityChangeHistory>;
type ReportDatasetMetadataRow = InferInsertModel<typeof reportDatasetMetadata>;

const HOURLY_DATASET_COUNT = 26;
const CENTS = 100;

export const buildIngestionState = (input: { accountId: string; countryCode: string; dayCount: number; now: Date; random: SeededRandom; structure: SeedAdStructure; timezone: string }) => {
    const lastSyncCompleted = new Date(input.now.getTime() - input.random.int(6, 90) * 60 * 1000);

    const accountDataset: AccountDatasetMetadataRow = {
        accountId: input.accountId,
        adGroupsCount: input.structure.adGroups.length,
        adsCount: input.structure.ads.length,
        campaignsCount: input.structure.campaigns.length,
        countryCode: input.countryCode,
        error: null,
        fetchingAdGroups: false,
        fetchingAdGroupsPollCount: 0,
        fetchingAds: false,
        fetchingAdsPollCount: 0,
        fetchingCampaigns: false,
        fetchingCampaignsPollCount: 0,
        fetchingTargets: false,
        fetchingTargetsPollCount: 0,
        lastSyncCompleted,
        lastSyncStarted: new Date(lastSyncCompleted.getTime() - 4 * 60 * 1000),
        targetsCount: input.structure.targets.length,
    };

    return {
        accountDatasetMetadata: [accountDataset],
        changeHistory: buildChangeHistory(input),
        changeHistorySync: buildChangeHistorySync(input),
        reportDatasetMetadata: [...buildDailyDatasets(input), ...buildHourlyDatasets(input)],
    };
};

const buildDailyDatasets = (input: { accountId: string; countryCode: string; dayCount: number; now: Date; random: SeededRandom; timezone: string }): ReportDatasetMetadataRow[] => {
    const rows: ReportDatasetMetadataRow[] = [];

    for (let dayOffset = 0; dayOffset < input.dayCount; dayOffset += 1) {
        const periodStart = zonedStartOfDay(zonedSubtractDays(input.now, dayOffset, input.timezone), input.timezone);
        // Today is still being refreshed, yesterday has just landed, and one
        // older day failed — the three shapes the table renders differently.
        const status = dayOffset === 0 ? 'fetching' : dayOffset === 1 ? 'parsing' : dayOffset === 5 ? 'failed' : 'completed';
        const totalRecords = input.random.int(180, 900);
        const errorRecords = status === 'failed' ? input.random.int(1, 12) : 0;

        rows.push({
            accountId: input.accountId,
            aggregation: 'daily',
            countryCode: input.countryCode,
            entityType: 'target',
            error: status === 'failed' ? 'Amazon returned FAILURE for this report.' : null,
            errorRecords,
            lastProcessedReportId: status === 'completed' ? buildReportId(input.random) : null,
            lastReportCreatedAt: new Date(periodStart.getTime() + 26 * 60 * 60 * 1000),
            nextRefreshAt: new Date(input.now.getTime() + input.random.int(20, 360) * 60 * 1000),
            periodStart,
            refreshing: status === 'fetching',
            reportId: buildReportId(input.random),
            status,
            successRecords: status === 'completed' ? totalRecords - errorRecords : 0,
            totalRecords: status === 'completed' ? totalRecords : 0,
        });
    }

    return rows;
};

const buildHourlyDatasets = (input: { accountId: string; countryCode: string; now: Date; random: SeededRandom; timezone: string }): ReportDatasetMetadataRow[] => {
    const rows: ReportDatasetMetadataRow[] = [];
    const latestHour = zonedTopOfHour(input.now, input.timezone);

    for (let hourOffset = 0; hourOffset < HOURLY_DATASET_COUNT; hourOffset += 1) {
        const periodStart = zonedSubtractHours(latestHour, hourOffset, input.timezone);
        const status = hourOffset === 0 ? 'missing' : hourOffset === 1 ? 'fetching' : 'completed';
        const totalRecords = input.random.int(20, 220);

        rows.push({
            accountId: input.accountId,
            aggregation: 'hourly',
            countryCode: input.countryCode,
            entityType: 'target',
            error: null,
            errorRecords: 0,
            lastProcessedReportId: status === 'completed' ? buildReportId(input.random) : null,
            lastReportCreatedAt: status === 'missing' ? null : new Date(periodStart.getTime() + 95 * 60 * 1000),
            nextRefreshAt: new Date(input.now.getTime() + input.random.int(5, 90) * 60 * 1000),
            periodStart,
            refreshing: status === 'fetching',
            reportId: status === 'missing' ? null : buildReportId(input.random),
            status,
            successRecords: status === 'completed' ? totalRecords : 0,
            totalRecords: status === 'completed' ? totalRecords : 0,
        });
    }

    return rows;
};

/**
 * Bid, state, and budget changes across the window, written as the daily
 * authoritative source with a couple of same-day BidBeacon writes on top — the
 * two sources the history table reconciles.
 */
const buildChangeHistory = (input: {
    accountId: string;
    countryCode: string;
    dayCount: number;
    now: Date;
    random: SeededRandom;
    structure: SeedAdStructure;
    timezone: string;
}): EntityChangeHistoryRow[] => {
    const rows: EntityChangeHistoryRow[] = [];
    const bidTargets = input.structure.servingTargets.slice(0, 12);

    for (const [index, target] of bidTargets.entries()) {
        const dayOffset = index % Math.max(1, input.dayCount - 1);
        const changedAt = zonedAddHours(zonedStartOfDay(zonedSubtractDays(input.now, dayOffset, input.timezone), input.timezone), input.random.int(8, 19), input.timezone);
        const previous = target.bidAmount;
        const next = Math.round(previous * input.random.between(0.75, 1.35) * CENTS) / CENTS;

        rows.push({
            accountId: input.accountId,
            changedAt,
            countryCode: input.countryCode,
            entityId: target.targetId,
            entityType: 'target',
            eventType: 'bid_change',
            fieldName: 'bidAmount',
            localDate: formatInTimeZone(changedAt, input.timezone, 'yyyy-MM-dd'),
            newValue: next.toFixed(2),
            previousValue: previous.toFixed(2),
            rawPayload: null,
            source: index % 3 === 0 ? 'bidbeacon' : 'change_history',
        });
    }

    for (const [index, seededCampaign] of input.structure.campaigns.slice(0, 4).entries()) {
        const changedAt = zonedAddHours(zonedStartOfDay(zonedSubtractDays(input.now, index + 1, input.timezone), input.timezone), 11, input.timezone);
        const budget = Number(seededCampaign.budgetAmount ?? '25');

        rows.push({
            accountId: input.accountId,
            changedAt,
            countryCode: input.countryCode,
            entityId: seededCampaign.campaignId,
            entityType: 'campaign',
            eventType: index % 2 === 0 ? 'budget_change' : 'state_change',
            fieldName: index % 2 === 0 ? 'budgetAmount' : 'state',
            localDate: formatInTimeZone(changedAt, input.timezone, 'yyyy-MM-dd'),
            newValue: index % 2 === 0 ? (budget * 1.2).toFixed(2) : seededCampaign.state,
            previousValue: index % 2 === 0 ? budget.toFixed(2) : 'PAUSED',
            rawPayload: null,
            source: 'change_history',
        });
    }

    return rows;
};

const buildChangeHistorySync = (input: { accountId: string; countryCode: string; dayCount: number; now: Date; timezone: string }): ChangeHistorySyncStateRow[] => {
    const rows: ChangeHistorySyncStateRow[] = [];

    // Today is deliberately absent: the authoritative daily reconciliation only
    // covers days that have closed.
    for (let dayOffset = 1; dayOffset < input.dayCount; dayOffset += 1) {
        const day = zonedStartOfDay(zonedSubtractDays(input.now, dayOffset, input.timezone), input.timezone);
        rows.push({
            accountId: input.accountId,
            countryCode: input.countryCode,
            localDate: formatInTimeZone(day, input.timezone, 'yyyy-MM-dd'),
            reconciledAt: new Date(day.getTime() + 30 * 60 * 60 * 1000),
        });
    }

    return rows;
};

const buildReportId = (random: SeededRandom) => `report-${random.int(100_000_000, 999_999_999).toString(36)}-dev`;

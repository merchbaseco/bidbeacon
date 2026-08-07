import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { and, eq, gte, lt } from 'drizzle-orm';
import { reportDatasetMetadata } from '@/db/schema';
import type { OperationContext } from './operation-context';
import type { SearchDateRange } from './search-planner';

export type SearchCoverageIssue = { date: string; status: 'PENDING' | 'FAILED' | 'UNKNOWN' } | { date: string; status: 'PARSE_ERRORS'; errorCount: number };

export type SearchCoverage = {
    status: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
    issues: SearchCoverageIssue[];
};

export const queryCampaignSearchCoverage = async (
    context: OperationContext,
    account: { adsAccountId: string; countryCode: string },
    dateRange: SearchDateRange,
    timezone: string
): Promise<SearchCoverage> => querySearchCoverage(context, account, dateRange, timezone, 'product');

export const queryTargetSearchCoverage = async (
    context: OperationContext,
    account: { adsAccountId: string; countryCode: string },
    dateRange: SearchDateRange,
    timezone: string
): Promise<SearchCoverage> => querySearchCoverage(context, account, dateRange, timezone, 'target');

const querySearchCoverage = async (
    context: OperationContext,
    account: { adsAccountId: string; countryCode: string },
    dateRange: SearchDateRange,
    timezone: string,
    entityType: 'product' | 'target'
): Promise<SearchCoverage> => {
    const start = fromZonedTime(`${dateRange.startDate}T00:00:00`, timezone);
    const endExclusive = fromZonedTime(
        `${addDays(new Date(`${dateRange.endDate}T00:00:00.000Z`), 1)
            .toISOString()
            .slice(0, 10)}T00:00:00`,
        timezone
    );
    const rows = await context.db
        .select()
        .from(reportDatasetMetadata)
        .where(
            and(
                eq(reportDatasetMetadata.accountId, account.adsAccountId),
                eq(reportDatasetMetadata.countryCode, account.countryCode),
                eq(reportDatasetMetadata.aggregation, 'daily'),
                eq(reportDatasetMetadata.entityType, entityType),
                gte(reportDatasetMetadata.periodStart, start),
                lt(reportDatasetMetadata.periodStart, endExclusive)
            )
        );

    const metadataByDate = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
        const date = formatInTimeZone(row.periodStart, timezone, 'yyyy-MM-dd');
        if (!metadataByDate.has(date)) {
            metadataByDate.set(date, row);
        }
    }

    const issues: SearchCoverageIssue[] = [];
    for (const date of getDateSequence(dateRange.startDate, dateRange.endDate)) {
        const metadata = metadataByDate.get(date);
        if (!metadata) {
            issues.push({ date, status: 'UNKNOWN' });
            continue;
        }

        const status = metadata.status.toLowerCase();
        if (status === 'completed' && metadata.errorRecords === 0) {
            continue;
        }
        if (status === 'completed' && metadata.errorRecords > 0) {
            issues.push({ date, status: 'PARSE_ERRORS', errorCount: metadata.errorRecords });
            continue;
        }
        if (status === 'failed') {
            issues.push({ date, status: 'FAILED' });
            continue;
        }
        issues.push({ date, status: 'PENDING' });
    }

    return {
        status: issues.length === 0 ? 'COMPLETE' : metadataByDate.size === 0 ? 'UNKNOWN' : 'INCOMPLETE',
        issues,
    };
};

const getDateSequence = (startDate: string, endDate: string) => {
    const dates: string[] = [];
    let current = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (current <= end) {
        dates.push(current.toISOString().slice(0, 10));
        current = addDays(current, 1);
    }
    return dates;
};

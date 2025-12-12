import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { fetchDashboardStatus } from './api.js';
import { queryKeys } from './query-keys.js';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

type Aggregation = 'daily' | 'hourly';

type ReportDatasetMetadata = {
    accountId: string;
    timestamp: string;
    aggregation: Aggregation;
    status: string;
    lastRefreshed: string | null;
    reportId: string;
    error: string | null;
};

export type DashboardStatus = {
    rows: ReportDatasetMetadata[];
    accountId: string;
    aggregation: Aggregation;
    range: { from: string; to: string };
    days: number;
};

export function useDashboardStatus(): UseQueryResult<DashboardStatus> {
    const [searchParams] = useSearchParams();

    const accountId = searchParams.get('accountId') ?? DEFAULT_ACCOUNT_ID;
    const aggregation = (searchParams.get('aggregation') as Aggregation) ?? 'daily';
    const days = Number(searchParams.get('days')) || 30;

    return useQuery<DashboardStatus>({
        queryKey: queryKeys.dashboardStatus(accountId, aggregation, days),
        queryFn: async () => {
            const now = new Date();
            const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

            const rows = await fetchDashboardStatus({
                accountId,
                aggregation,
                from: from.toISOString(),
                to: now.toISOString(),
            });

            return {
                rows,
                accountId,
                aggregation,
                range: { from: from.toISOString(), to: now.toISOString() },
                days,
            };
        },
    });
}

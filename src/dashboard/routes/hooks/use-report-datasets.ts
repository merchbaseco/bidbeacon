import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { fetchDashboardStatus } from './api.js';
import { queryKeys } from './query-keys.js';
import { useSelectedAccountId } from './use-selected-accountid.js';
import { useSelectedCountryCode } from './use-selected-country-code.js';

type Aggregation = 'daily' | 'hourly';

export type ReportDatasetMetadata = {
    accountId: string;
    countryCode: string;
    timestamp: string;
    aggregation: Aggregation;
    status: string;
    lastRefreshed: string | null;
    reportId: string;
    error: string | null;
};

export function useReportDatasets(aggregation: Aggregation = 'daily'): UseQueryResult<ReportDatasetMetadata[]> {
    const [searchParams] = useSearchParams();
    const accountId = useSelectedAccountId();
    const countryCode = useSelectedCountryCode();
    const days = Number(searchParams.get('days')) || 30;

    return useQuery({
        queryKey: queryKeys.dashboardStatus(accountId, aggregation, days, countryCode),
        queryFn: async (): Promise<ReportDatasetMetadata[]> => {
            const now = new Date();
            const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

            const rows = await fetchDashboardStatus({
                accountId,
                countryCode,
                aggregation,
                from: from.toISOString(),
                to: now.toISOString(),
            });

            return rows;
        },
        enabled: !!countryCode, // Only fetch when country code is available
    });
}

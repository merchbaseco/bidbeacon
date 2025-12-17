import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../lib/trpc.js';
import { useSelectedAccountId } from './use-selected-accountid.js';
import { useSelectedCountryCode } from './use-selected-country-code.js';

type Aggregation = 'daily' | 'hourly';

type ReportDatasetMetadata = {
    accountId: string;
    countryCode: string;
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

export function useDashboardStatus() {
    const [searchParams] = useSearchParams();
    const accountId = useSelectedAccountId();
    const countryCode = useSelectedCountryCode();
    const aggregation = (searchParams.get('aggregation') as Aggregation) ?? 'daily';
    const days = Number(searchParams.get('days')) || 30;

    const dateRange = useMemo(() => {
        const now = new Date();
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        return { from: from.toISOString(), to: now.toISOString() };
    }, [days]);

    const { data, ...rest } = api.reports.status.useQuery(
        {
            accountId,
            countryCode,
            aggregation,
            from: dateRange.from,
            to: dateRange.to,
        },
        {
            enabled: !!countryCode,
        }
    );

    return {
        ...rest,
        data: data
            ? {
                  rows: data.data,
                  accountId,
                  aggregation,
                  range: dateRange,
                  days,
              }
            : undefined,
    };
}

import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../lib/trpc.js';
import { useSelectedAccountId } from './use-selected-accountid.js';
import { useSelectedCountryCode } from './use-selected-country-code.js';

type Aggregation = 'daily' | 'hourly';

export type ReportDatasetMetadata = {
    accountId: string;
    countryCode: string;
    timestamp: string;
    aggregation: Aggregation;
    entityType: 'target' | 'product';
    status: string;
    refreshing: boolean;
    lastRefreshed: string | null;
    reportId: string;
    error: string | null;
};

export function useReportDatasets(aggregation: Aggregation = 'daily') {
    const [searchParams] = useSearchParams();
    const accountId = useSelectedAccountId();
    const countryCode = useSelectedCountryCode();
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
            select: response => response.data,
            refetchOnMount: true,
            refetchOnWindowFocus: true,
        }
    );

    return {
        ...rest,
        data: data as ReportDatasetMetadata[] | undefined,
    };
}

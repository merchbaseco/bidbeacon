import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { api, type RouterOutputs } from '../../lib/trpc';
import { useSelectedAccountId } from './use-selected-accountid';
import { useSelectedCountryCode } from './use-selected-country-code';

type Aggregation = 'daily' | 'hourly';

export type ReportDatasetMetadata = RouterOutputs['reports']['status'][number];

export const useReportDatasets = (aggregation: Aggregation = 'daily') => {
    const [searchParams] = useSearchParams();
    const accountId = useSelectedAccountId();
    const countryCode = useSelectedCountryCode();
    const days = Number(searchParams.get('days')) || 30;

    const dateRange = useMemo(() => {
        const now = new Date();
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        return { from: from.toISOString(), to: now.toISOString() };
    }, [days]);

    const { data, isLoading, ...rest } = api.reports.status.useQuery(
        {
            accountId,
            countryCode,
            aggregation,
            from: dateRange.from,
            to: dateRange.to,
        },
        {
            enabled: !!countryCode,
            refetchOnMount: true,
            refetchOnWindowFocus: true,
        }
    );

    return {
        data,
        isLoading,
        ...rest,
    };
};

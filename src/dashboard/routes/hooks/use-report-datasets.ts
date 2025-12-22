import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useSearchParams } from 'react-router';
import { api, type RouterOutputs } from '../../lib/trpc';
import { aggregationAtom, entityTypeAtom, limitAtom, offsetAtom, statusFilterAtom } from '../components/reports-table/atoms';
import { useSelectedAccountId } from './use-selected-accountid';
import { useSelectedCountryCode } from './use-selected-country-code';

type Aggregation = 'daily' | 'hourly';

export type ReportDatasetMetadata = RouterOutputs['reports']['status']['data'][number];

export const useReportDatasets = () => {
    const [searchParams] = useSearchParams();
    const accountId = useSelectedAccountId();
    const countryCode = useSelectedCountryCode();
    const aggregation = useAtomValue(aggregationAtom);
    const entityType = useAtomValue(entityTypeAtom);
    const statusFilter = useAtomValue(statusFilterAtom);
    const limit = useAtomValue(limitAtom);
    const offset = useAtomValue(offsetAtom);
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
            entityType,
            statusFilter,
            from: dateRange.from,
            to: dateRange.to,
            limit,
            offset,
        },
        {
            enabled: !!countryCode,
            refetchOnMount: true,
            refetchOnWindowFocus: true,
        }
    );

    return {
        data: data?.data ?? [],
        total: data?.total ?? 0,
        isLoading,
        ...rest,
    };
};

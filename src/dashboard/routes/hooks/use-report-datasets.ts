import { useAtomValue } from 'jotai';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { api, type RouterOutputs } from '../../lib/trpc';
import { aggregationAtom, entityTypeAtom, limitAtom, offsetAtom, statusFilterAtom } from '../components/reports-table/atoms';
import { roundUpToNearestMinute } from '../utils';
import { useSelectedAccountId } from './use-selected-accountid';
import { useSelectedCountryCode } from './use-selected-country-code';

export type ReportSummary = RouterOutputs['reports']['summary']['data'][number];
export type ReportDatasetMetadata = RouterOutputs['reports']['get'];

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
    const apiUtils = api.useUtils();

    const dateRange = useMemo(() => {
        // Round dates up to nearest minute to ensure stable query keys across components
        // This prevents multiple components from creating separate queries due to
        // millisecond-level timestamp differences
        const now = new Date();
        const roundedNow = roundUpToNearestMinute(now);
        const from = new Date(roundedNow.getTime() - days * 24 * 60 * 60 * 1000);
        return { from: from.toISOString(), to: roundedNow.toISOString() };
    }, [days]);

    const { data, isLoading, ...rest } = api.reports.summary.useQuery(
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

    // Populate reports.get cache with data from summary so individual queries don't fire
    useEffect(() => {
        if (data?.data) {
            data.data.forEach(report => {
                apiUtils.reports.get.setData({ uid: report.uid }, report);
            });
        }
    }, [data?.data, apiUtils]);

    return {
        data: data?.data ?? [],
        total: data?.total ?? 0,
        isLoading,
        ...rest,
    };
};

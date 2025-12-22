import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { api, type RouterOutputs } from '../../lib/trpc';
import { aggregationAtom, entityTypeAtom, limitAtom, offsetAtom, statusFilterAtom } from '../components/reports-table/atoms';
import { roundUpToNearestMinute } from '../utils';
import { useSelectedAccountId } from './use-selected-accountid';
import { useSelectedCountryCode } from './use-selected-country-code';
import { useWebSocketEvents } from './use-websocket-events';

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
        // Round dates up to nearest minute to ensure stable query keys across components
        // This prevents multiple components from creating separate queries due to
        // millisecond-level timestamp differences
        const now = new Date();
        const roundedNow = roundUpToNearestMinute(now);
        const from = new Date(roundedNow.getTime() - days * 24 * 60 * 60 * 1000);
        return { from: from.toISOString(), to: roundedNow.toISOString() };
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

    /**
     * Update the individual rows the report dataset metadata is updated
     */
    const apiUtils = api.useUtils();
    useWebSocketEvents('report:refreshed', event => {
        apiUtils.reports.status.setData(
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
            prev => {
                if (!prev || !Array.isArray(prev.data)) return prev;
                // Convert Date objects to ISO strings to match cached data shape
                const row = {
                    ...event.row,
                    periodStart: event.row.periodStart.toISOString(),
                    nextRefreshAt: event.row.nextRefreshAt?.toISOString() ?? null,
                    lastReportCreatedAt: event.row.lastReportCreatedAt?.toISOString() ?? null,
                };
                return {
                    ...prev,
                    data: prev.data.map(item => (item.uid === row.uid ? row : item)),
                };
            }
        );
    });

    return {
        data: data?.data ?? [],
        total: data?.total ?? 0,
        isLoading,
        ...rest,
    };
};

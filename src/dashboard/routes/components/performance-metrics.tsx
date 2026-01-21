import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { api } from '@/dashboard/lib/trpc';
import { cn } from '@/dashboard/lib/utils';
import { Spinner } from '../../components/ui/spinner';
import { useSelectedAccountId } from '../hooks/use-selected-accountid';
import { customRangeAtom, entityFiltersAtom, performanceRangeAtom } from './performance-metrics-atoms';
import { selectedCountryCodeAtom } from './account-selector/atoms';
import { PerformanceMetricsChart } from './performance-metrics-chart';
import { PerformanceMetricsControls } from './performance-metrics-controls';
import { PerformanceMetricsSearch } from './performance-metrics-search';

const PerformanceMetrics = ({ className }: { className?: string }) => {
    const accountId = useSelectedAccountId();
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    const range = useAtomValue(performanceRangeAtom);
    const customRange = useAtomValue(customRangeAtom);
    const entityFilters = useAtomValue(entityFiltersAtom);

    const isCustomRangeActive = Boolean(customRange?.start && customRange?.end);
    const isLiveRange = range === 'today' && !isCustomRangeActive;
    const refetchInterval = isLiveRange ? 60000 : 300000;
    const staleTime = isLiveRange ? 30000 : 120000;

    const entityFilterPayload = useMemo(
        () => (entityFilters.length ? entityFilters.map(filter => ({ type: filter.type, id: filter.id })) : undefined),
        [entityFilters]
    );

    const rangeConfig = useMemo(
        () => ({
            accountId: accountId!,
            countryCode,
            range,
            customRange: isCustomRangeActive ? customRange : null,
            entityFilters: entityFilterPayload,
        }),
        [accountId, countryCode, customRange, entityFilterPayload, isCustomRangeActive, range]
    );

    const { data, isLoading, error } = api.metrics.hourlyPerformance.useQuery(rangeConfig, {
        enabled: Boolean(accountId && countryCode),
        refetchInterval,
        staleTime,
    });

    if (!accountId || !countryCode) {
        return (
            <div className={cn('w-full', className)}>
                <div className="flex items-center justify-center h-[360px]">
                    <Spinner className="size-6 text-muted-foreground" />
                </div>
            </div>
        );
    }

    return (
        <div className={cn('w-full', className)}>
            <PerformanceMetricsControls totals={data?.totals} changes={data?.changes} />
            <PerformanceMetricsChart data={data} isLoading={isLoading} error={error} />
            <PerformanceMetricsSearch accountId={accountId!} />
        </div>
    );
};

export { PerformanceMetrics };

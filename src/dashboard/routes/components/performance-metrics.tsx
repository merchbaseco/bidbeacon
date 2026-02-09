import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { api } from '@/dashboard/lib/trpc';
import { cn } from '@/dashboard/lib/utils';
import { customRangeAtom, entityFiltersAtom, performanceRangeAtom } from '@/dashboard/state/performance-metrics-state';
import { Spinner } from '../../components/ui/spinner';
import { useSelectedAccountId } from '../hooks/use-selected-accountid';
import { selectedCountryCodeAtom } from './account-selector/atoms';
import { PerformanceMetricsChart } from './performance-metrics-chart';
import { PerformanceMetricsControls } from './performance-metrics-controls';

const PerformanceMetrics = ({ className }: { className?: string }) => {
    const accountId = useSelectedAccountId();
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    const range = useAtomValue(performanceRangeAtom);
    const customRange = useAtomValue(customRangeAtom);
    const entityFilters = useAtomValue(entityFiltersAtom);

    const isCustomRangeActive = Boolean(customRange?.start && customRange?.end);
    const isLiveRange = range === 'today' && !isCustomRangeActive;
    const refetchInterval = isLiveRange ? 60_000 : 300_000;
    const staleTime = isLiveRange ? 30_000 : 120_000;

    const entityFilterPayload = useMemo(() => (entityFilters.length ? entityFilters.map(filter => ({ type: filter.type, id: filter.id })) : undefined), [entityFilters]);

    const rangeConfig = useMemo(
        () => ({
            accountId: accountId ?? '',
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

    if (!(accountId && countryCode)) {
        return (
            <div className={cn('w-full', className)}>
                <div className="flex h-[360px] items-center justify-center">
                    <Spinner className="size-6 text-muted-foreground" />
                </div>
            </div>
        );
    }

    return (
        <div className={cn('w-full', className)}>
            <PerformanceMetricsControls changes={data?.changes} range={data?.range} timezone={data?.timezone} totals={data?.totals} />
            <PerformanceMetricsChart data={data} error={error} isLoading={isLoading} />
        </div>
    );
};

export { PerformanceMetrics };

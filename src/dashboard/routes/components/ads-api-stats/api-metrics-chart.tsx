import { useMemo } from 'react';
import { Bar, BarStack, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { api } from '@/dashboard/lib/trpc';
import { roundUpToNearestMinute } from '../../utils';
import { ChartTooltip } from '../chart-tooltip';

/**
 * Throttler Metrics Chart - Shows API calls per 5-minute interval for the last 1 hour
 */
export const ApiMetricsChart = () => {
    const dateRange = useMemo(() => {
        // Round up to nearest minute to ensure stable query keys
        const to = roundUpToNearestMinute(new Date());
        const from = new Date(to.getTime() - 1 * 60 * 60 * 1000); // 1 hour
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []);

    const { data, isLoading, error } = api.metrics.adsApi.useQuery(dateRange, {
        refetchInterval: 300000, // 5 minutes
        staleTime: 60000,
    });

    const chartData = data?.data ?? [];

    const formatXAxisTick = (_value: string, index: number) => {
        const totalTicks = chartData.length;

        // Show specific labels at key intervals
        if (index === totalTicks - 1) {
            return 'now';
        }
        if (index === 0) {
            return '1hr';
        }
        // 15min = index 9 (out of 12 intervals)
        if (index === Math.floor(totalTicks * 0.75)) {
            return '15min';
        }
        // 30min = index 6 (out of 12 intervals)
        if (index === Math.floor(totalTicks * 0.5)) {
            return '30min';
        }
        // 45min = index 3 (out of 12 intervals)
        if (index === Math.floor(totalTicks * 0.25)) {
            return '45min';
        }
        return '';
    };

    const formatYAxisTick = (value: number) => {
        return Number.isInteger(value) ? value.toString() : '';
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Loading throttler metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-[200px] text-destructive text-sm">Error loading throttler metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    return (
        <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%" debounce={300}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} tickFormatter={formatYAxisTick} />
                    <Tooltip content={<ChartTooltip chartData={chartData} intervalMs={5 * 60 * 1000} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    <BarStack radius={4}>
                        {(data?.apiNames || []).map((apiName, index) => (
                            <Bar key={apiName} dataKey={apiName} stackId="apis" fill={LEGEND_COLORS[index % LEGEND_COLORS.length]} name={apiName} isAnimationActive={false} />
                        ))}
                    </BarStack>
                    <Line type="linear" dataKey="429" stroke={LEGEND_COLORS[5]} strokeWidth={1.5} dot={false} name="429" isAnimationActive={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

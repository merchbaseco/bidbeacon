import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { api } from '@/dashboard/lib/trpc';
import { formatTimeAgo } from '@/dashboard/lib/utils';
import { roundUpToNearestMinute } from '../../utils';
import { ChartTooltip } from '../chart-tooltip';

/**
 * Throttler Metrics Chart - Shows API calls per 5-minute interval for the last 3 hours
 */
export const ThrottlerMetricsChart = () => {
    const dateRange = useMemo(() => {
        // Round up to nearest minute to ensure stable query keys
        const to = roundUpToNearestMinute(new Date());
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []);

    const { data, isLoading, error } = api.metrics.adsApiThrottler.useQuery(dateRange, {
        refetchInterval: 300000, // 5 minutes
        staleTime: 60000,
    });

    const chartData = data?.data ?? [];

    const formatXAxisTick = (value: string, index: number) => {
        const point = chartData.find(p => p.interval === value);
        if (!point) return value;

        const totalTicks = chartData.length;
        const tickInterval = Math.floor(totalTicks / 4);
        if (index === 0 || index === totalTicks - 1 || index % tickInterval === 0) {
            return formatTimeAgo(point.timestamp as string);
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
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} tickFormatter={formatYAxisTick} />
                    <Tooltip content={<ChartTooltip chartData={chartData} intervalMs={5 * 60 * 1000} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    {(data?.apiNames || []).map((apiName, index) => {
                        const isFirst = index === 0;
                        const isLast = index === (data?.apiNames?.length || 0) - 1;
                        const radius: [number, number, number, number] = isFirst && isLast ? [4, 4, 4, 4] : isFirst ? [0, 0, 4, 4] : isLast ? [4, 4, 0, 0] : [0, 0, 0, 0];
                        return <Bar key={apiName} dataKey={apiName} stackId="apis" fill={LEGEND_COLORS[index % LEGEND_COLORS.length]} name={apiName} isAnimationActive={false} radius={radius} />;
                    })}
                    <Line type="linear" dataKey="429" stroke={LEGEND_COLORS[5]} strokeWidth={1.5} dot={false} name="429" isAnimationActive={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

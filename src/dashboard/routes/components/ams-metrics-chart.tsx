import { useMemo } from 'react';
import { Bar, BarStack, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { api } from '@/dashboard/lib/trpc';
import { roundUpToNearestMinute } from '../utils';
import { ChartTooltip } from './chart-tooltip';

/**
 * AMS Metrics Chart - Shows AMS event processing counts per 5-minute interval for the last 1 hour
 */
export const AmsMetricsChart = () => {
    const dateRange = useMemo(() => {
        // Round up to nearest minute to ensure stable query keys
        const to = roundUpToNearestMinute(new Date());
        const from = new Date(to.getTime() - 1 * 60 * 60 * 1000); // 1 hour
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []);

    const { data, isLoading, error } = api.metrics.ams.useQuery(dateRange, {
        refetchInterval: 300000, // 5 minutes
        staleTime: 60000,
    });

    // Generate all 5-minute intervals from `from` to `to`, filling with zeros
    const chartData = useMemo(() => {
        if (!data) return [];

        const roundedFrom = new Date(dateRange.from);
        roundedFrom.setMinutes(Math.floor(roundedFrom.getMinutes() / 5) * 5, 0, 0);
        const roundedTo = new Date(dateRange.to);
        roundedTo.setMinutes(Math.floor(roundedTo.getMinutes() / 5) * 5, 0, 0);

        const intervals: Array<{ interval: string; timestamp: string; [entityType: string]: string | number }> = [];

        for (let ts = roundedFrom.getTime(); ts <= roundedTo.getTime(); ts += 5 * 60 * 1000) {
            const date = new Date(ts);
            const interval = date.toISOString();
            const point: { interval: string; timestamp: string; [entityType: string]: string | number } = {
                interval: date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                timestamp: interval,
            };

            // Add count for each entity type (0 if no data)
            for (const entityType of data.entityTypes || []) {
                const intervalData = data.data[entityType]?.find(d => d.interval === interval);
                point[entityType] = intervalData?.count ?? 0;
            }

            intervals.push(point);
        }

        return intervals;
    }, [data, dateRange]);

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
        return <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Loading AMS metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-[200px] text-destructive text-sm">Error loading AMS metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    return (
        <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} tickFormatter={formatYAxisTick} />
                    <Tooltip content={<ChartTooltip chartData={chartData} intervalMs={5 * 60 * 1000} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    <BarStack radius={4}>
                        {(data?.entityTypes || []).map((entityType, index) => (
                            <Bar key={entityType} dataKey={entityType} stackId="entities" fill={LEGEND_COLORS[index % LEGEND_COLORS.length]} name={entityType} isAnimationActive={false} />
                        ))}
                    </BarStack>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};


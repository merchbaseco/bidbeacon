import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { api } from '@/dashboard/lib/trpc';
import { roundUpToNearestMinute } from '../utils';
import { ChartTooltip } from './chart-tooltip';

/**
 * Aggregation Metrics Chart - Shows aggregation job activity and row counts per 5-minute interval for the last 1 hour
 */
export const AggregationMetricsChart = () => {
    const dateRange = useMemo(() => {
        // Round up to nearest minute to ensure stable query keys
        const to = roundUpToNearestMinute(new Date());
        const from = new Date(to.getTime() - 1 * 60 * 60 * 1000); // 1 hour
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []);

    const { data, isLoading, error } = api.metrics.aggregation.useQuery(dateRange, {
        refetchInterval: 300000, // 5 minutes
        staleTime: 60000,
    });

    // Generate all 5-minute intervals from `from` to `to`, filling with zeros
    const chartData = useMemo(() => {
        const roundedFrom = new Date(dateRange.from);
        roundedFrom.setMinutes(Math.floor(roundedFrom.getMinutes() / 5) * 5, 0, 0);
        const roundedTo = new Date(dateRange.to);
        roundedTo.setMinutes(Math.floor(roundedTo.getMinutes() / 5) * 5, 0, 0);

        const intervals: Array<{ interval: string; timestamp: string; jobCount: number; totalRowsInserted: number }> = [];
        const dataMap = new Map<string, { jobCount: number; totalRowsInserted: number }>();

        // Build map from aggregation data
        if (data?.data) {
            for (const row of data.data) {
                dataMap.set(row.interval, {
                    jobCount: row.jobCount,
                    totalRowsInserted: row.totalRowsInserted,
                });
            }
        }

        for (let ts = roundedFrom.getTime(); ts <= roundedTo.getTime(); ts += 5 * 60 * 1000) {
            const date = new Date(ts);
            const interval = date.toISOString();
            const pointData = dataMap.get(interval) || { jobCount: 0, totalRowsInserted: 0 };

            intervals.push({
                interval: date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                timestamp: interval,
                jobCount: pointData.jobCount,
                totalRowsInserted: pointData.totalRowsInserted,
            });
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
        return <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Loading aggregation metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-[200px] text-destructive text-sm">Error loading aggregation metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    return (
        <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} tickFormatter={formatYAxisTick} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={60} />
                    <Tooltip content={<ChartTooltip chartData={chartData} intervalMs={5 * 60 * 1000} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    <Bar yAxisId="left" dataKey="jobCount" fill={LEGEND_COLORS[0]} name="Jobs" radius={4} isAnimationActive={false} />
                    <Line yAxisId="right" type="linear" dataKey="totalRowsInserted" stroke={LEGEND_COLORS[1]} strokeWidth={1.5} dot={false} name="Rows Inserted" isAnimationActive={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};


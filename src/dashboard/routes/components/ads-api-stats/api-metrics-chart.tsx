import { format } from 'date-fns';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { formatTimeAgo } from '@/dashboard/lib/utils';
import { useAdsApiMetrics } from '@/dashboard/routes/hooks/use-ads-api-metrics';
import { ChartTooltip } from '../chart-tooltip';

/**
 * API Metrics Chart Component
 *
 * Displays a line chart showing API invocation counts over time,
 * with a table below showing totals for each API endpoint.
 */
export const ApiMetricsChart = () => {
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []);

    const { data, isLoading, error } = useAdsApiMetrics(dateRange);

    // Generate all 5-minute intervals for the last 3 hours
    const intervals = useMemo(() => {
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        const intervalList: string[] = [];

        // Round start down to the nearest 5-minute interval
        const roundedStart = new Date(threeHoursAgo);
        roundedStart.setMinutes(Math.floor(roundedStart.getMinutes() / 5) * 5, 0, 0);

        // Round now down to the nearest 5-minute interval
        const roundedEnd = new Date(now);
        roundedEnd.setMinutes(Math.floor(roundedEnd.getMinutes() / 5) * 5, 0, 0);

        // Generate all 5-minute intervals
        let current = new Date(roundedStart);
        while (current <= roundedEnd) {
            intervalList.push(current.toISOString());
            current = new Date(current.getTime() + 5 * 60 * 1000); // Add 5 minutes
        }

        return intervalList;
    }, []);

    // Transform data for Recharts
    const chartData = useMemo(() => {
        return intervals.map(interval => {
            const point: Record<string, string | number> = {
                interval: format(new Date(interval), 'HH:mm'),
                timestamp: interval,
            };

            // Add count for each API, defaulting to 0 if no data
            const apiNames = data?.apiNames || [];
            for (const apiName of apiNames) {
                const apiData = data?.data[apiName] || [];
                const matchingPoint = apiData.find(p => p.interval === interval);
                point[apiName] = matchingPoint ? matchingPoint.count : 0;
            }

            return point;
        });
    }, [intervals, data]);

    if (isLoading) {
        return <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">Loading API metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-[400px] text-destructive text-sm">Error loading API metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    // Custom tick formatter to show relative time at specific intervals
    const formatXAxisTick = (value: string, index: number) => {
        const point = chartData.find(p => p.interval === value);
        if (!point) return value;

        // Show tick at roughly every 3 hours (36 intervals of 5 minutes = 3 hours)
        const totalTicks = chartData.length;
        const tickInterval = Math.floor(totalTicks / 4); // Show ~5 ticks
        if (index === 0 || index === totalTicks - 1 || index % tickInterval === 0) {
            return formatTimeAgo(point.timestamp as string);
        }
        return '';
    };

    return (
        <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} />
                    <Tooltip content={<ChartTooltip chartData={chartData} intervalMs={5 * 60 * 1000} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    {(data?.apiNames || []).map((apiName, index) => (
                        <Line key={apiName} type="monotone" dataKey={apiName} stroke={LEGEND_COLORS[index % LEGEND_COLORS.length]} strokeWidth={1.5} dot={false} name={apiName} />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

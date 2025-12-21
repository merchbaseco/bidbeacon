import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { formatTimeAgo } from '@/dashboard/lib/utils';
import { useAdsApiThrottlerMetrics } from '../../hooks/use-ads-api-throttler-metrics';
import { ChartTooltip } from '../chart-tooltip';

/**
 * Throttler Metrics Chart Component
 *
 * Displays a line chart showing throttler metrics over the last minute:
 * - Total API calls per second
 * - Rate-limited calls (429 responses) per second
 */
export const ThrottlerMetricsChart = () => {
    const [queryRefreshKey, setQueryRefreshKey] = useState(0);

    // Refresh the query every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setQueryRefreshKey(prev => prev + 1);
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    // Calculate date range (last 60 seconds)
    // biome-ignore lint/correctness/useExhaustiveDependencies: queryRefreshKey is intentionally used to trigger recalculation
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 60 * 1000);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, [queryRefreshKey]);

    const { data } = useAdsApiThrottlerMetrics(dateRange);

    // Transform for Recharts (add interval field for x-axis display)
    const chartData = useMemo(() => {
        if (!data?.data) return [];
        return data.data.map(point => ({
            ...point,
            interval: point.time,
        }));
    }, [data]);

    // Calculate max count for Y-axis scaling
    const maxCount = useMemo(() => {
        if (chartData.length === 0) return 1;
        const maxTotal = Math.max(...chartData.map(p => p.total));
        const maxRateLimited = Math.max(...chartData.map(p => p.rateLimited));
        return Math.max(maxTotal, maxRateLimited, 1);
    }, [chartData]);

    // Custom tick formatter to show relative time
    const formatXAxisTick = (value: string, index: number) => {
        const point = chartData.find(p => p.interval === value);
        if (!point) return value;

        // Show ~5 ticks
        const totalTicks = chartData.length;
        const tickInterval = Math.max(1, Math.floor(totalTicks / 5));
        if (index === 0 || index === totalTicks - 1 || index % tickInterval === 0) {
            return formatTimeAgo(point.timestamp);
        }
        return '';
    };

    return (
        <div className="w-full h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} domain={[0, maxCount]} />
                    <Tooltip content={<ChartTooltip chartData={chartData} intervalMs={1000} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    <Line type="monotone" dataKey="total" stroke={LEGEND_COLORS[3]} strokeWidth={1.5} dot={false} name="Total Calls" isAnimationActive={false} />
                    <Line type="monotone" dataKey="rateLimited" stroke={LEGEND_COLORS[5]} strokeWidth={1.5} dot={false} name="Rate Limited (429)" isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

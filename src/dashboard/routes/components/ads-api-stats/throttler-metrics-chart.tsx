import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { formatTimeAgo } from '@/dashboard/lib/utils';
import { useAdsApiThrottlerMetrics } from '../../hooks/use-ads-api-throttler-metrics';
import { ChartTooltip } from '../chart-tooltip';

/**
 * Throttler Metrics Chart Component
 *
 * Displays a line chart showing throttler metrics over time:
 * - Total API calls
 * - Rate-limited calls (429 responses)
 * Uses 1-second intervals for the last minute.
 */
export const ThrottlerMetricsChart = () => {
    // Update every second for visual chart updates
    const [now, setNow] = useState(new Date());

    // Separate state for query updates (these happens only every 10 seconds).
    const [queryRefreshKey, setQueryRefreshKey] = useState(0);

    useEffect(() => {
        // Update visual state every second
        const visualInterval = setInterval(() => {
            setNow(new Date());
        }, 1000);

        // Update query every 10 seconds
        const queryInterval = setInterval(() => {
            setQueryRefreshKey(prev => prev + 1);
        }, 10000);

        return () => {
            clearInterval(visualInterval);
            clearInterval(queryInterval);
        };
    }, []);

    // Memoize from date, recalculate when queryRefreshKey changes (every 10 seconds)
    // Round 'from' to nearest 10 seconds to group queries and reduce DB load while ensuring query key changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: queryRefreshKey is intentionally used to trigger recalculation
    const dateRange = useMemo(() => {
        const now = new Date();
        // Round down to nearest 10 seconds - this groups queries and reduces DB load
        const roundedNow = new Date(Math.floor(now.getTime() / 10000) * 10000);
        const from = new Date(roundedNow.getTime() - 60 * 1000); // 1 minute before rounded time
        return {
            from: from.toISOString(),
            // Don't pass 'to' - let server default to 'now' so we always get latest data
        };
    }, [queryRefreshKey]);

    const { data } = useAdsApiThrottlerMetrics(dateRange);

    // Generate all 1-second intervals for the last minute, recalculate when 'now' changes
    const intervals = useMemo(() => {
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        const intervalList: string[] = [];

        // Round start down to the nearest 1-second interval
        const roundedStart = new Date(oneMinuteAgo);
        roundedStart.setMilliseconds(0);

        // Round now down to the nearest 1-second interval
        const roundedEnd = new Date(now);
        roundedEnd.setMilliseconds(0);

        // Generate all 1-second intervals
        let current = new Date(roundedStart);
        while (current <= roundedEnd) {
            intervalList.push(current.toISOString());
            current = new Date(current.getTime() + 1000); // Add 1 second
        }

        return intervalList;
    }, [now]);

    // Transform data for Recharts
    const chartData = useMemo(() => {
        return intervals.map(interval => {
            const point: Record<string, string | number> = {
                interval: format(new Date(interval), 'HH:mm:ss'),
                timestamp: interval,
            };

            // Find matching data point
            const matchingPoint = data?.data.find(p => {
                const dataInterval = new Date(p.interval);
                const currentInterval = new Date(interval);
                // Match if within the same second
                return dataInterval.getTime() >= currentInterval.getTime() && dataInterval.getTime() < currentInterval.getTime() + 1000;
            });

            point.total = matchingPoint ? matchingPoint.total : 0;
            point.rateLimited = matchingPoint ? matchingPoint.rateLimited : 0;

            return point;
        });
    }, [intervals, data]);

    // Calculate max count for Y-axis scaling
    const maxCount = useMemo(() => {
        const maxTotal = Math.max(...chartData.map(p => p.total as number), 1);
        const maxRateLimited = Math.max(...chartData.map(p => p.rateLimited as number), 1);
        return Math.max(maxTotal, maxRateLimited);
    }, [chartData]);

    // Custom tick formatter to show relative time with seconds
    const formatXAxisTick = (value: string, index: number) => {
        const point = chartData.find(p => p.interval === value);
        if (!point) return value;

        // Show tick at roughly every 15 seconds (15 intervals of 1 second = 15 seconds)
        const totalTicks = chartData.length;
        const tickInterval = Math.max(1, Math.floor(totalTicks / 5)); // Show ~5 ticks
        if (index === 0 || index === totalTicks - 1 || index % tickInterval === 0) {
            return formatTimeAgo(point.timestamp as string);
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

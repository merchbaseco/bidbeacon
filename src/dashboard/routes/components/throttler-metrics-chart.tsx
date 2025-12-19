import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useThrottlerMetrics } from '../hooks/use-throttler-metrics';

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
        dataKey: string | number;
        name?: string;
        value?: number;
        color?: string;
    }>;
    label?: string;
    chartData: Array<{ interval: string; total: number; rateLimited: number }>;
}

/**
 * Custom tooltip component for throttler metrics
 */
function CustomTooltip({ active, payload, label, chartData }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    // Find point by matching the formatted interval label
    const point = chartData.find(p => p.interval === label);
    if (!point || !point.timestamp) return null;

    const timestamp = new Date(point.timestamp as string);
    // Check if timestamp is valid
    if (Number.isNaN(timestamp.getTime())) return null;

    const endTime = new Date(timestamp.getTime() + 1000); // 1 second interval

    // Format local time range with seconds
    const localStart = format(timestamp, 'h:mm:ssaaa');
    const localEnd = format(endTime, 'h:mm:ssaaa');

    // Format UTC time range with seconds
    const utcStart = formatInTimeZone(timestamp, 'UTC', 'h:mm:ssaaa');
    const utcEnd = formatInTimeZone(endTime, 'UTC', 'h:mm:ssaaa');

    const rateLimitPercentage = point.total > 0 ? ((point.rateLimited / point.total) * 100).toFixed(1) : '0.0';

    return (
        <div className="bg-card border border-border rounded-lg shadow-md p-3 min-w-[180px]">
            {/* Series list */}
            <div className="flex flex-col gap-1.5 mb-3">
                {payload.map(entry => (
                    <div key={entry.dataKey} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                            <span className="text-sm text-foreground">{entry.name}</span>
                        </div>
                        <span className="text-sm text-foreground font-medium">{entry.value}</span>
                    </div>
                ))}
                {point.total > 0 && (
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                        <span className="text-sm text-muted-foreground">Rate Limit %</span>
                        <span className="text-sm text-foreground font-medium">{rateLimitPercentage}%</span>
                    </div>
                )}
            </div>

            {/* Time ranges */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-muted-foreground">
                    {localStart} - {localEnd}
                </span>
                <span className="text-[13px] text-muted-foreground">
                    {utcStart} - {utcEnd} UTC
                </span>
            </div>
        </div>
    );
}

/**
 * Format timestamp to relative time with seconds (e.g., "45s ago", "30s ago", "15s ago")
 */
function formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffSeconds < 60) {
        return `${diffSeconds}s ago`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
}

/**
 * Throttler Metrics Chart Component
 *
 * Displays a line chart showing throttler metrics over time:
 * - Total API calls
 * - Rate-limited calls (429 responses)
 * Uses 1-second intervals for the last minute.
 */
export function ThrottlerMetricsChart() {
    // Update every second for visual chart updates
    const [now, setNow] = useState(new Date());

    // Separate state for query updates (slower, to avoid hammering DB)
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

    const { data, isLoading, error } = useThrottlerMetrics(dateRange);

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

    // Calculate totals
    const totals = useMemo(() => {
        const total = chartData.reduce((sum, point) => sum + (point.total as number), 0);
        const rateLimited = chartData.reduce((sum, point) => sum + (point.rateLimited as number), 0);
        const rateLimitPercentage = total > 0 ? ((rateLimited / total) * 100).toFixed(1) : '0.0';
        return { total, rateLimited, rateLimitPercentage };
    }, [chartData]);

    // Calculate max count for Y-axis scaling
    const maxCount = useMemo(() => {
        const maxTotal = Math.max(...chartData.map(p => p.total as number), 1);
        const maxRateLimited = Math.max(...chartData.map(p => p.rateLimited as number), 1);
        return Math.max(maxTotal, maxRateLimited);
    }, [chartData]);

    if (isLoading) {
        return <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Loading throttler metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-[200px] text-destructive text-sm">Error loading throttler metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    // Custom tick formatter to show relative time with seconds
    const formatXAxisTick = (value: string, index: number) => {
        const point = chartData.find(p => p.interval === value);
        if (!point) return value;

        // Show tick at roughly every 15 seconds (15 intervals of 1 second = 15 seconds)
        const totalTicks = chartData.length;
        const tickInterval = Math.max(1, Math.floor(totalTicks / 5)); // Show ~5 ticks
        if (index === 0 || index === totalTicks - 1 || index % tickInterval === 0) {
            return formatRelativeTime(point.timestamp as string);
        }
        return '';
    };

    return (
        <div className="w-full">
            {/* Summary stats */}
            <div className="flex gap-4 mb-4 text-sm">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Total Calls:</span>
                    <span className="font-medium">{totals.total.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Rate Limited:</span>
                    <span className="font-medium text-destructive">{totals.rateLimited.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Rate Limit %:</span>
                    <span className="font-medium">{totals.rateLimitPercentage}%</span>
                </div>
            </div>

            {/* Chart */}
            <div className="w-full h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                        <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                        <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} domain={[0, maxCount]} />
                        <Tooltip content={<CustomTooltip chartData={chartData as Array<{ interval: string; total: number; rateLimited: number }>} />} />
                        <Line type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={1.5} dot={false} name="Total Calls" isAnimationActive={false} />
                        <Line type="monotone" dataKey="rateLimited" stroke="#EF4444" strokeWidth={1.5} dot={false} name="Rate Limited (429)" isAnimationActive={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

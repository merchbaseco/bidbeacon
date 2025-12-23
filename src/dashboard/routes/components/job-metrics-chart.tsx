import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useMemo } from 'react';
import { Bar, BarStack, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useJobMetrics } from '../hooks/use-job-metrics';
import { roundUpToNearestMinute } from '../utils';
import { ChartTooltipPortal } from './chart-tooltip-portal';

// Color palette for jobs
const COLORS = [
    '#F59E0B', // Amber/Orange
    '#10B981', // Green
    '#14B8A6', // Teal
    '#3B82F6', // Blue
    '#8B5CF6', // Purple
    '#EF4444', // Red
    '#EC4899', // Pink
    '#6366F1', // Indigo
];

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
        dataKey: string | number;
        name?: string;
        value?: number;
        color?: string;
    }>;
    label?: string;
    coordinate?: { x: number; y: number };
    chartData: Record<string, string | number>[];
}

/**
 * Custom tooltip component matching the design spec
 */
function CustomTooltip({ active, payload, label, coordinate, chartData }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const point = chartData.find(p => p.interval === label);
    if (!point) return null;

    const timestamp = new Date(point.timestamp as string);
    const endTime = new Date(timestamp.getTime() + 5 * 60 * 1000); // 5 min interval

    // Format local time range
    const localStart = format(timestamp, 'h:mmaaa');
    const localEnd = format(endTime, 'h:mmaaa');

    // Format UTC time range
    const utcStart = formatInTimeZone(timestamp, 'UTC', 'h:mmaaa');
    const utcEnd = formatInTimeZone(endTime, 'UTC', 'h:mmaaa');

    return (
        <ChartTooltipPortal active={active} coordinate={coordinate}>
            <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
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
        </ChartTooltipPortal>
    );
}

/**
 * Job Metrics Chart Component
 *
 * Displays a stacked bar chart showing job invocation counts over time,
 * with a table below showing totals for each job.
 */
export function JobMetricsChart() {
    const dateRange = useMemo(() => {
        // Round up to nearest minute to ensure stable query keys
        const to = roundUpToNearestMinute(new Date());
        const from = new Date(to.getTime() - 1 * 60 * 60 * 1000); // 1 hour
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []);

    const { data, isLoading, error } = useJobMetrics(dateRange);

    // Generate all 5-minute intervals for the last 1 hour
    const intervals = useMemo(() => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
        const intervalList: string[] = [];

        // Round start down to the nearest 5-minute interval
        const roundedStart = new Date(oneHourAgo);
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

            // Add count for each job, defaulting to 0 if no data
            const jobNames = data?.jobNames || [];
            for (const jobName of jobNames) {
                const jobData = data?.data[jobName] || [];
                const matchingPoint = jobData.find(p => p.interval === interval);
                point[jobName] = matchingPoint ? matchingPoint.count : 0;
            }

            return point;
        });
    }, [intervals, data]);

    if (isLoading) {
        return <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">Loading job metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-[400px] text-destructive text-sm">Error loading job metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    // Custom tick formatter to show specific time labels
    const formatXAxisTick = (value: string, index: number) => {
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
        // Only show integer values
        return Number.isInteger(value) ? value.toString() : '';
    };

    return (
        <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} tickFormatter={formatYAxisTick} />
                    <Tooltip content={<CustomTooltip chartData={chartData} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    <BarStack radius={4}>
                        {(data?.jobNames || []).map((jobName, index) => (
                            <Bar key={jobName} dataKey={jobName} stackId="jobs" fill={COLORS[index % COLORS.length]} name={jobName} isAnimationActive={false} />
                        ))}
                    </BarStack>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

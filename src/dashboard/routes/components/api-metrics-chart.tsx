import { format, formatDistanceToNow } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useApiMetrics } from '../hooks/use-api-metrics';

// Color palette for APIs
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
    chartData: Record<string, string | number>[];
}

/**
 * Custom tooltip component matching the design spec
 */
function CustomTooltip({ active, payload, label, chartData }: CustomTooltipProps) {
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
 * Format timestamp to relative time (e.g., "12h ago", "3h ago", "2m ago")
 */
function formatRelativeTime(timestamp: string): string {
    const distance = formatDistanceToNow(new Date(timestamp), { addSuffix: false });
    // Shorten the format: "about 12 hours" -> "12h", "3 hours" -> "3h", "2 minutes" -> "2m"
    return `${distance.replace('about ', '').replace(' hours', 'h').replace(' hour', 'h').replace(' minutes', 'm').replace(' minute', 'm').replace('less than a minute', '0m')} ago`;
}

/**
 * API Metrics Chart Component
 *
 * Displays a line chart showing API invocation counts over time,
 * with a table below showing totals for each API endpoint.
 */
export function ApiMetricsChart() {
    // Memoize from date to keep query key stable, but let server calculate 'to' as 'now' on each query
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return {
            from: from.toISOString(),
            // Don't pass 'to' - let server default to 'now' so we always get latest data
        };
    }, []); // Empty deps - only calculate once

    const { data, isLoading, error } = useApiMetrics(dateRange);

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

    // Calculate totals for each API
    const apiTotals = useMemo(() => {
        const apiNames = data?.apiNames || [];
        return apiNames
            .map((apiName, index) => {
                const apiData = data?.data[apiName] || [];
                const total = apiData.reduce((sum, point) => sum + point.count, 0);
                return {
                    name: apiName,
                    total,
                    color: COLORS[index % COLORS.length],
                };
            })
            .sort((a, b) => b.total - a.total); // Sort by total descending
    }, [data]);

    // Calculate max count for bar scaling
    const maxCount = useMemo(() => {
        if (apiTotals.length === 0) return 1;
        return Math.max(...apiTotals.map(api => api.total));
    }, [apiTotals]);

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
            return formatRelativeTime(point.timestamp as string);
        }
        return '';
    };

    return (
        <div className="w-full">
            {/* Chart */}
            <div className="w-full h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                        <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                        <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} />
                        <Tooltip content={<CustomTooltip chartData={chartData} />} />
                        {(data?.apiNames || []).map((apiName, index) => (
                            <Line key={apiName} type="monotone" dataKey={apiName} stroke={COLORS[index % COLORS.length]} strokeWidth={1.5} dot={false} name={apiName} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="w-full">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>API Endpoint</TableHead>
                            <TableHead>Count</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {apiTotals.map(api => {
                            const percentage = maxCount > 0 ? (api.total / maxCount) * 100 : 0;
                            return (
                                <TableRow key={api.name}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: api.color }} />
                                            {api.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="relative w-full h-6 flex items-center">
                                            <div className="h-full bg-muted rounded flex items-center px-2 min-w-fit" style={{ width: `${Math.max(percentage, 0)}%` }}>
                                                <span className="text-sm text-foreground whitespace-nowrap">{api.total.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

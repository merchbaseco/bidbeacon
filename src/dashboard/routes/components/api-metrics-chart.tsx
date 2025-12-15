import { format, formatDistanceToNow } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
        <div
            style={{
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                padding: '12px 16px',
                minWidth: '180px',
            }}
        >
            {/* Series list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {payload.map(entry => (
                    <div
                        key={entry.dataKey}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                                style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: entry.color,
                                    flexShrink: 0,
                                }}
                            />
                            <span style={{ fontSize: '14px', color: '#374151' }}>{entry.name}</span>
                        </div>
                        <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>{entry.value}</span>
                    </div>
                ))}
            </div>

            {/* Time ranges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', color: '#6B7280' }}>
                    {localStart} - {localEnd}
                </span>
                <span style={{ fontSize: '13px', color: '#9CA3AF' }}>
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
        const from = new Date(to.getTime() - 12 * 60 * 60 * 1000); // 12 hours
        return {
            from: from.toISOString(),
            // Don't pass 'to' - let server default to 'now' so we always get latest data
        };
    }, []); // Empty deps - only calculate once

    const { data, isLoading, error } = useApiMetrics(dateRange);

    // Generate all 5-minute intervals for the last 12 hours
    const intervals = useMemo(() => {
        const now = new Date();
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const intervalList: string[] = [];

        // Round start down to the nearest 5-minute interval
        const roundedStart = new Date(twelveHoursAgo);
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

    if (isLoading) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#9CA3AF', fontSize: '14px' }}>Loading API metrics...</div>;
    }

    if (error) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#EF4444', fontSize: '14px' }}>
                Error loading API metrics: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
        );
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
        <div style={{ width: '100%' }}>
            {/* Chart */}
            <div style={{ width: '100%', height: '250px', marginBottom: '24px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
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
            <div style={{ width: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                            <th style={{ textAlign: 'left', padding: '12px 16px', color: '#6B7280', fontWeight: 500, fontSize: '14px' }}>API Endpoint</th>
                            <th style={{ textAlign: 'right', padding: '12px 16px', color: '#6B7280', fontWeight: 500, fontSize: '14px' }}>Count Sum</th>
                        </tr>
                    </thead>
                    <tbody>
                        {apiTotals.map(api => (
                            <tr key={api.name} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span
                                            style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                backgroundColor: api.color,
                                                flexShrink: 0,
                                            }}
                                        />
                                        {api.name}
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right', padding: '12px 16px', fontSize: '14px', color: '#111827' }}>{api.total.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

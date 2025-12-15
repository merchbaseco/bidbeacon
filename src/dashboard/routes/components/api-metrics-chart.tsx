import { format } from 'date-fns';
import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApiMetrics } from '../hooks/use-api-metrics';

/**
 * API Metrics Chart Component
 *
 * Displays a line chart showing API invocation counts over time,
 * with a separate line for each API endpoint.
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

        // Round threeHoursAgo down to the nearest 5-minute interval
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

    if (isLoading) {
        return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading API metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-64 text-sm text-destructive">Error loading API metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    // Transform data for Recharts
    // Create chart data with all intervals, filling in missing data with 0
    const chartData = intervals.map(interval => {
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

    // Generate colors for each API (using a simple color palette)
    const colors = [
        '#8884d8', // Blue
        '#82ca9d', // Green
        '#ffc658', // Yellow
        '#ff7300', // Orange
        '#8dd1e1', // Cyan
        '#d084d0', // Purple
    ];

    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="interval" angle={-45} textAnchor="end" height={80} interval="preserveStartEnd" style={{ fontSize: '12px' }} tickCount={7} />
                    <YAxis style={{ fontSize: '12px' }} />
                    <Tooltip
                        labelFormatter={value => {
                            const point = chartData.find(p => p.interval === value);
                            return point ? format(new Date(point.timestamp as string), 'MMM dd, yyyy HH:mm') : value;
                        }}
                        formatter={(value: number) => [value, 'Invocations']}
                    />
                    <Legend />
                    {(data?.apiNames || []).map((apiName, index) => (
                        <Line key={apiName} type="monotone" dataKey={apiName} stroke={colors[index % colors.length]} strokeWidth={2} dot={false} name={apiName} />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

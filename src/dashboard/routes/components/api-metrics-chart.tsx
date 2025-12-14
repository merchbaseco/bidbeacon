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
    // Memoize date range to prevent query key from changing on every render
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []); // Empty deps - only calculate once

    const { data, isLoading, error } = useApiMetrics(dateRange);

    if (isLoading) {
        return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading API metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-64 text-sm text-destructive">Error loading API metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

    if (!data || !data.data || Object.keys(data.data).length === 0) {
        return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">No API metrics data available</div>;
    }

    // Transform data for Recharts
    // We need to combine all API data points by hour
    const hours = new Set<string>();
    for (const apiData of Object.values(data.data)) {
        for (const point of apiData) {
            hours.add(point.hour);
        }
    }

    const sortedHours = Array.from(hours).sort();
    const chartData = sortedHours.map(hour => {
        const point: Record<string, string | number> = {
            hour: format(new Date(hour), 'MMM dd HH:mm'),
            timestamp: hour,
        };

        // Add count for each API
        for (const apiName of data.apiNames) {
            const apiData = data.data[apiName];
            const matchingPoint = apiData.find(p => p.hour === hour);
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
                    <XAxis dataKey="hour" angle={-45} textAnchor="end" height={80} interval="preserveStartEnd" style={{ fontSize: '12px' }} />
                    <YAxis style={{ fontSize: '12px' }} />
                    <Tooltip
                        labelFormatter={value => {
                            const point = chartData.find(p => p.hour === value);
                            return point ? format(new Date(point.timestamp as string), 'MMM dd, yyyy HH:mm') : value;
                        }}
                        formatter={(value: number) => [value, 'Invocations']}
                    />
                    <Legend />
                    {data.apiNames.map((apiName, index) => (
                        <Line key={apiName} type="monotone" dataKey={apiName} stroke={colors[index % colors.length]} strokeWidth={2} dot={false} name={apiName} />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

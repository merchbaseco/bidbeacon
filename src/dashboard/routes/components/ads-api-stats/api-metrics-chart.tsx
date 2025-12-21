import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { formatTimeAgo } from '@/dashboard/lib/utils';
import { useAdsApiMetrics } from '@/dashboard/routes/hooks/use-ads-api-metrics';
import { ChartTooltip } from '../chart-tooltip';

/**
 * API Metrics Chart - Shows API invocation counts per 5-minute interval over the last 3 hours
 */
export const ApiMetricsChart = () => {
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return { from: from.toISOString(), to: to.toISOString() };
    }, []);

    const { data, isLoading, error } = useAdsApiMetrics(dateRange);

    // Transform for Recharts - data is already chart-ready
    const chartData = useMemo(() => {
        if (!data?.data) return [];
        return data.data.map(point => ({ ...point }));
    }, [data]);

    const formatXAxisTick = (_value: string, index: number) => {
        if (chartData.length === 0) return '';
        if (index === 0) return '3h';
        if (index === chartData.length - 1) return '0h';
        const tickInterval = Math.floor(chartData.length / 4);
        if (index % tickInterval === 0) {
            const point = chartData[index];
            return formatTimeAgo(point.timestamp);
        }
        return '';
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">Loading API metrics...</div>;
    }

    if (error) {
        return <div className="flex items-center justify-center h-[400px] text-destructive text-sm">Error loading API metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>;
    }

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

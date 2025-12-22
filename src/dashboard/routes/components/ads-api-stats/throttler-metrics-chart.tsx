import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { api } from '@/dashboard/lib/trpc';
import { useWebSocketEvents } from '../../hooks/use-websocket-events';
import { ChartTooltip } from '../chart-tooltip';

type ChartPoint = {
    time: string;
    timestamp: string;
    interval: string;
    [apiName: string]: string | number;
};

function createEmptyPoint(date: Date, apiNames: string[]): ChartPoint {
    const time = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const point: ChartPoint = {
        time,
        timestamp: date.toISOString(),
        interval: time,
    };
    for (const apiName of apiNames) {
        point[apiName] = 0;
    }
    point['429'] = 0;
    return point;
}

/**
 * Throttler Metrics Chart - Shows API calls per second for the last 60 seconds
 */
export const ThrottlerMetricsChart = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [chartData, setChartData] = useState<ChartPoint[]>([]);

    // Refresh query every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => setRefreshKey(k => k + 1), 10000);
        return () => clearInterval(interval);
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers recalculation
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 60_000);
        return { from: from.toISOString(), to: to.toISOString() };
    }, [refreshKey]);

    const { data } = api.metrics.adsApiThrottler.useQuery(dateRange, {
        refetchInterval: 60000,
        staleTime: 1000,
    });

    // Sync chart data when backend data arrives
    useEffect(() => {
        if (data?.data) {
            setChartData(data.data);
        }
    }, [data]);

    // Slide window forward every second
    useEffect(() => {
        const interval = setInterval(() => {
            setChartData(prev => {
                if (prev.length === 0 || !data?.apiNames) return prev;
                const now = new Date();
                now.setMilliseconds(0);
                const newPoint = createEmptyPoint(now, data.apiNames);
                // Skip if current second already exists
                if (prev[prev.length - 1]?.timestamp === newPoint.timestamp) return prev;
                return [...prev.slice(1), newPoint];
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [data?.apiNames]);

    // Real-time updates: just increment the current (last) second for the specific API
    useWebSocketEvents('api-metrics:updated', event => {
        setChartData(prev => {
            if (prev.length === 0) return prev;
            const lastIdx = prev.length - 1;
            const updated = [...prev];
            const apiName = event.data.apiName;
            const currentValue = (updated[lastIdx][apiName] as number) || 0;
            const is429 = event.data.statusCode === 429;
            const current429Value = (updated[lastIdx]['429'] as number) || 0;
            updated[lastIdx] = {
                ...updated[lastIdx],
                [apiName]: currentValue + 1,
                '429': is429 ? current429Value + 1 : current429Value,
            };
            return updated;
        });
    });

    const formatXAxisTick = (_value: string, index: number) => {
        if (index === 0) return '60s';
        if (index === chartData.length - 1) return '0s';
        return '';
    };

    const formatYAxisTick = (value: number) => {
        // Only show integer values
        return Number.isInteger(value) ? value.toString() : '';
    };

    return (
        <div className="w-full h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="interval" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={formatXAxisTick} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={40} domain={[0, 2]} tickFormatter={formatYAxisTick} />
                    <Tooltip content={<ChartTooltip chartData={chartData} intervalMs={1000} />} wrapperStyle={{ visibility: 'visible', pointerEvents: 'none' }} />
                    {(data?.apiNames || []).map((apiName, index) => {
                        const isFirst = index === 0;
                        const isLast = index === (data?.apiNames?.length || 0) - 1;
                        const radius: [number, number, number, number] =
                            isFirst && isLast
                                ? [4, 4, 4, 4] // Single bar: round all corners
                                : isFirst
                                  ? [0, 0, 4, 4] // First bar: round bottom corners
                                  : isLast
                                    ? [4, 4, 0, 0] // Last bar: round top corners
                                    : [0, 0, 0, 0]; // Middle bars: no rounding
                        return <Bar key={apiName} dataKey={apiName} stackId="apis" fill={LEGEND_COLORS[index % LEGEND_COLORS.length]} name={apiName} isAnimationActive={false} radius={radius} />;
                    })}
                    <Line type="linear" dataKey="429" stroke={LEGEND_COLORS[5]} strokeWidth={1.5} dot={false} name="429" isAnimationActive={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

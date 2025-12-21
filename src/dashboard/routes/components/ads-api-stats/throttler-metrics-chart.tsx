import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { api } from '@/dashboard/lib/trpc';
import { useWebSocketEvents } from '../../hooks/use-websocket-events';
import { ChartTooltip } from '../chart-tooltip';

type ChartPoint = {
    time: string;
    timestamp: string;
    total: number;
    rateLimited: number;
    interval: string;
};

function createEmptyPoint(date: Date): ChartPoint {
    const time = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { time, timestamp: date.toISOString(), total: 0, rateLimited: 0, interval: time };
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
        refetchInterval: 10000,
        staleTime: 5000,
    });

    // Sync chart data when backend data arrives
    useEffect(() => {
        if (data?.data) {
            setChartData(data.data.map(p => ({ ...p, interval: p.time })));
        }
    }, [data]);

    // Slide window forward every second
    useEffect(() => {
        const interval = setInterval(() => {
            setChartData(prev => {
                if (prev.length === 0) return prev;
                const now = new Date();
                now.setMilliseconds(0);
                const newPoint = createEmptyPoint(now);
                // Skip if current second already exists
                if (prev[prev.length - 1]?.timestamp === newPoint.timestamp) return prev;
                return [...prev.slice(1), newPoint];
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Real-time updates: just increment the current (last) second
    useWebSocketEvents('api-metrics:updated', event => {
        setChartData(prev => {
            if (prev.length === 0) return prev;
            const lastIdx = prev.length - 1;
            const updated = [...prev];
            updated[lastIdx] = {
                ...updated[lastIdx],
                total: updated[lastIdx].total + 1,
                rateLimited: updated[lastIdx].rateLimited + (event.data.statusCode === 429 ? 1 : 0),
            };
            return updated;
        });
    });

    const maxCount = useMemo(() => {
        if (chartData.length === 0) return 1;
        return Math.max(...chartData.map(p => Math.max(p.total, p.rateLimited)), 1);
    }, [chartData]);

    const formatXAxisTick = (_value: string, index: number) => {
        if (index === 0) return '60s';
        if (index === chartData.length - 1) return '0s';
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

import { format } from 'date-fns';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/dashboard/lib/trpc';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { useSelectedAccountId } from '../hooks/use-selected-accountid';

type MetricConfig = {
    key: keyof NonNullable<ReturnType<typeof api.metrics.dailyPerformance.useQuery>['data']>['data'][number];
    label: string;
    formatter: (value: number) => string;
};

const METRICS: MetricConfig[] = [
    {
        key: 'impressions',
        label: 'Impressions',
        formatter: (value) => value.toLocaleString(),
    },
    {
        key: 'clicks',
        label: 'Clicks',
        formatter: (value) => value.toLocaleString(),
    },
    {
        key: 'orders',
        label: 'Orders',
        formatter: (value) => value.toLocaleString(),
    },
    {
        key: 'spend',
        label: 'Spend',
        formatter: (value) => `$${value.toFixed(2)}`,
    },
    {
        key: 'acos',
        label: 'ACoS',
        formatter: (value) => `${value.toFixed(2)}%`,
    },
    {
        key: 'ctr',
        label: 'CTR',
        formatter: (value) => `${value.toFixed(2)}%`,
    },
    {
        key: 'cpc',
        label: 'CPC',
        formatter: (value) => `$${value.toFixed(2)}`,
    },
];

const MetricChart = ({ metric, data }: { metric: MetricConfig; data: Array<{ bucketDate: string; [key: string]: string | number }> }) => {
    const chartData = useMemo(() => {
        return data.map(point => ({
            ...point,
            value: point[metric.key] as number,
            dateLabel: format(new Date(point.bucketDate), 'M/d'),
        }));
    }, [data, metric.key]);

    const formatXAxisTick = (value: string, index: number) => {
        const totalTicks = chartData.length;
        // Show first, last, and a few in between
        if (index === 0 || index === totalTicks - 1) {
            return value;
        }
        // Show every ~3rd day
        if (index % 3 === 0) {
            return value;
        }
        return '';
    };

    return (
        <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="0" vertical={false} />
                    <XAxis
                        dataKey="dateLabel"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                        tickFormatter={formatXAxisTick}
                        interval={0}
                    />
                    <YAxis hide />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const dataPoint = payload[0];
                            if (!dataPoint) return null;
                            return (
                                <div className="bg-card border border-border rounded-lg shadow-lg p-2">
                                    <div className="text-xs text-muted-foreground mb-1">{dataPoint.payload.bucketDate as string}</div>
                                    <div className="text-sm font-medium">{metric.formatter(dataPoint.value as number)}</div>
                                </div>
                            );
                        }}
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export const DailyPerformanceMetrics = () => {
    const accountId = useSelectedAccountId();

    const { data, isLoading, error } = api.metrics.dailyPerformance.useQuery(
        { accountId, days: 14 },
        {
            refetchInterval: 300000, // 5 minutes
            staleTime: 60000,
        }
    );

    if (isLoading) {
        return (
            <Card className="p-4">
                <div className="flex items-center justify-center h-[200px]">
                    <Spinner />
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-4">
                <div className="flex items-center justify-center h-[200px] text-destructive text-sm">
                    Error loading metrics: {error instanceof Error ? error.message : 'Unknown error'}
                </div>
            </Card>
        );
    }

    const chartData = data?.data ?? [];

    return (
        <Card className="p-4">
            <div className="grid grid-cols-7 gap-4">
                {METRICS.map(metric => (
                    <div key={metric.key} className="flex flex-col">
                        <div className="text-sm font-medium mb-2">{metric.label}</div>
                        <MetricChart metric={metric} data={chartData} />
                    </div>
                ))}
            </div>
        </Card>
    );
};


import { useMemo } from 'react';
import { Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/dashboard/lib/trpc';
import { cn } from '@/dashboard/lib/utils';
import { Spinner } from '../../components/ui/spinner';
import { useSelectedAccountId } from '../hooks/use-selected-accountid';

type MetricConfig = {
    key: 'impressions' | 'clicks' | 'orders' | 'spend' | 'acos';
    label: string;
    formatter: (value: number) => string;
    color?: string;
    isGood?: 'up' | 'down'; // Whether increase is good (up) or bad (down)
};

const METRICS: MetricConfig[] = [
    {
        key: 'impressions',
        label: 'Impressions',
        formatter: value => value.toLocaleString(),
        isGood: 'up',
    },
    {
        key: 'clicks',
        label: 'Clicks',
        formatter: value => value.toLocaleString(),
        color: '#6366f1', // indigo-500
        isGood: 'up',
    },
    {
        key: 'orders',
        label: 'Orders',
        formatter: value => value.toLocaleString(),
        color: '#10b981', // emerald-500
        isGood: 'up',
    },
    {
        key: 'spend',
        label: 'Spend',
        formatter: value => `$${value.toFixed(2)}`,
        color: '#f59e0b', // amber-500
        isGood: 'down',
    },
    {
        key: 'acos',
        label: 'ACoS',
        formatter: value => `${value.toFixed(1)}%`,
        color: '#ef4444', // red-500
        isGood: 'down',
    },
];

const MetricLabel = ({ metric, value, change }: { metric: MetricConfig; value: number; change: number }) => {
    const isPositiveChange = change > 0;
    const isGoodChange = metric.isGood === 'up' ? isPositiveChange : !isPositiveChange;
    const showDot = metric.color !== undefined;

    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">{metric.label}</span>
                {showDot && <span className="size-2 rounded-full" style={{ backgroundColor: metric.color }} />}
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight">{metric.formatter(value)}</span>
                {change !== 0 && (
                    <span className={cn('text-sm font-medium', isGoodChange ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                        {isPositiveChange ? '+' : ''}
                        {change.toFixed(0)}%
                    </span>
                )}
            </div>
        </div>
    );
};

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; payload: Record<string, number | string> }> }) => {
    if (!active || !payload || payload.length === 0) return null;

    const dataPoint = payload[0]?.payload;
    if (!dataPoint) return null;

    return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[160px]">
            <div className="text-sm font-medium text-foreground mb-2">{dataPoint.hourLabel}</div>
            <div className="space-y-1.5">
                {METRICS.map(metric => {
                    const value = dataPoint[metric.key];
                    if (typeof value !== 'number') return null;
                    return (
                        <div key={metric.key} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                                {metric.color ? (
                                    <span className="size-2 rounded-full" style={{ backgroundColor: metric.color }} />
                                ) : (
                                    <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                                )}
                                <span className="text-xs text-muted-foreground">{metric.label}</span>
                            </div>
                            <span className="text-xs font-medium">{metric.formatter(value)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const DailyPerformanceMetrics = () => {
    const accountId = useSelectedAccountId();

    const { data, isLoading, error } = api.metrics.hourlyPerformance.useQuery(
        { accountId },
        {
            refetchInterval: 60000, // 1 minute for hourly data
            staleTime: 30000,
        }
    );

    const chartData = useMemo(() => data?.hourlyData ?? [], [data?.hourlyData]);
    const currentHour = data?.currentHour ?? new Date().getHours();

    // Custom tick formatter for X axis - only show 00:00, current hour, and 23:00
    const formatXAxisTick = (value: string, index: number) => {
        if (index === 0) return '00:00';
        if (index === currentHour) return value;
        if (index === 23) return '23:00';
        return '';
    };

    if (isLoading) {
        return (
            <div className="w-full">
                <div className="flex items-center justify-center h-[340px]">
                    <Spinner />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full">
                <div className="flex items-center justify-center h-[340px] text-destructive text-sm">Error loading metrics: {error instanceof Error ? error.message : 'Unknown error'}</div>
            </div>
        );
    }

    // Get current hour label for the reference line
    const currentHourLabel = `${currentHour.toString().padStart(2, '0')}:00`;

    return (
        <div className="w-full">
            {/* Metric Labels */}
            <div className="flex items-start justify-between gap-8 mb-4 px-2">
                {METRICS.map(metric => (
                    <MetricLabel key={metric.key} metric={metric} value={data?.totals[metric.key] ?? 0} change={data?.changes[metric.key] ?? 0} />
                ))}
            </div>

            {/* Chart */}
            <div className="w-full h-[280px] -mx-4">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 10 }}>
                        <XAxis dataKey="hourLabel" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={formatXAxisTick} interval={0} />

                        {/* Hidden Y axes for each metric to scale them independently */}
                        <YAxis yAxisId="impressions" hide domain={[0, 'auto']} />
                        <YAxis yAxisId="clicks" hide domain={[0, 'auto']} />
                        <YAxis yAxisId="orders" hide domain={[0, 'auto']} />
                        <YAxis yAxisId="spend" hide domain={[0, 'auto']} />
                        <YAxis yAxisId="acos" hide domain={[0, 'auto']} />

                        {/* Reference line for current hour */}
                        <ReferenceLine x={currentHourLabel} stroke="#d1d5db" strokeDasharray="4 4" yAxisId="impressions" />

                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />

                        {/* Impressions as bars - subtle gray */}
                        <Bar yAxisId="impressions" dataKey="impressions" fill="currentColor" className="text-zinc-200 dark:text-zinc-800" radius={[2, 2, 0, 0]} isAnimationActive={false} />

                        {/* Lines for each metric */}
                        <Line yAxisId="clicks" type="monotone" dataKey="clicks" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line yAxisId="acos" type="monotone" dataKey="acos" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

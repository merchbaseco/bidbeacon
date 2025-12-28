import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, YAxis } from 'recharts';
import { api } from '@/dashboard/lib/trpc';
import { Card } from '../../../components/ui/card';
import { Spinner } from '../../../components/ui/spinner';
import { cn } from '@/dashboard/lib/utils';

const Sparkline = ({ data }: { data: number[] }) => {
    const localMax = Math.max(...data);
    const maxValue = Math.max(localMax, 10);

    const chartData = useMemo(() => {
        return data.map((value) => {
            const intensity = value / maxValue;
            const opacity = value === 0 ? 0.15 : 0.2 + intensity * 0.8;
            const displayValue = value === 0 ? maxValue * 0.08 : value;

            return {
                value: displayValue,
                originalValue: value,
                opacity,
            };
        });
    }, [data, maxValue]);

    return (
        <div className="h-8 w-full">
            <ResponsiveContainer width="100%" height="100%" debounce={300}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <YAxis domain={[0, maxValue]} hide />
                    <Bar
                        dataKey="value"
                        radius={[2, 2, 0, 0]}
                        isAnimationActive={false}
                        shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { opacity: number } }) => {
                            const { x = 0, y = 0, width = 0, height = 0, payload } = props;
                            const opacity = payload?.opacity ?? 0.5;
                            return <rect x={x} y={y} width={width} height={height} fill="currentColor" opacity={opacity} rx={2} className="text-indigo-500" />;
                        }}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const MessageThroughputCard = () => {
    const { data, isLoading, error } = api.metrics.messageThroughput.useQuery(undefined, {
        refetchInterval: 60000, // 1 minute
        staleTime: 30000,
    });

    if (isLoading) {
        return (
            <Card className="p-4">
                <div className="flex items-center justify-center h-32">
                    <Spinner />
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-4">
                <div className="flex items-center justify-center h-32 text-destructive text-sm">
                    Error loading metrics: {error instanceof Error ? error.message : 'Unknown error'}
                </div>
            </Card>
        );
    }

    const total = data?.currentHourTotal ?? 0;
    const percentChange = data?.percentChange ?? 0;
    const sparkline = data?.sparkline ?? [];

    const isPositiveChange = percentChange > 0;
    const changeColor = isPositiveChange ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';

    return (
        <Card className="p-4">
            <div className="space-y-3">
                <div className="text-sm text-muted-foreground">Messages (60m)</div>
                <div className="space-y-2">
                    <Sparkline data={sparkline} />
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-semibold tracking-tight">{total.toLocaleString()}</span>
                        {percentChange !== 0 && (
                            <span className={cn('text-sm font-medium', changeColor)}>
                                {isPositiveChange ? '+' : ''}
                                {percentChange.toFixed(0)}%
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-muted-foreground">vs previous hour</div>
                </div>
            </div>
        </Card>
    );
};


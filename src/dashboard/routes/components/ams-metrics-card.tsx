import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, YAxis } from 'recharts';
import { api } from '@/dashboard/lib/trpc';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';

type MetricRow = {
    label: string;
    entityType: 'campaign' | 'adGroup' | 'ad' | 'target' | 'spTraffic' | 'spConversion' | 'dlq' | 'total';
    sparklineData: number[];
    total: number;
    lastActivity?: string;
};

const Sparkline = ({ data, globalMax }: { data: number[]; globalMax?: number }) => {
    const localMax = Math.max(...data);
    // Use global max if provided, otherwise use local max with a minimum of 10
    // This ensures zero-only sparklines show tiny bars
    const maxValue = globalMax ?? Math.max(localMax, 10);

    // Transform data: ensure minimum bar height and calculate opacity based on value
    const chartData = useMemo(() => {
        return data.map((value, index) => {
            // Normalize value to 0-1 range for opacity
            const intensity = value / maxValue;
            // Min opacity 0.15 for zero values, max 1.0 for highest value
            const opacity = value === 0 ? 0.15 : 0.2 + intensity * 0.8;
            // Ensure a minimum visible bar height
            const displayValue = value === 0 ? maxValue * 0.08 : value;

            return {
                value: displayValue,
                originalValue: value,
                opacity,
                index,
            };
        });
    }, [data, maxValue]);

    return (
        <div className="h-6 w-18">
            <ResponsiveContainer debounce={300} height="100%" width="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <YAxis domain={[0, maxValue]} hide />
                    <Bar
                        dataKey="value"
                        isAnimationActive={false}
                        radius={[2, 2, 0, 0]}
                        shape={(props: any) => {
                            const { x = 0, y = 0, width = 0, height = 0, payload } = props ?? {};
                            const opacity = payload?.opacity ?? 0.5;
                            return <rect className="text-indigo-500" fill="currentColor" height={height} opacity={opacity} rx={2} width={width} x={x} y={y} />;
                        }}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

const MetricRow = ({ label, sparklineData, total, lastActivity, globalMax }: { label: string; sparklineData: number[]; total: number; lastActivity?: string; globalMax: number }) => {
    const isRecent = lastActivity && Date.now() - new Date(lastActivity).getTime() < 5 * 60 * 1000; // Within 5 minutes

    return (
        <div className="flex h-9 items-center justify-between">
            <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${isRecent ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                <span className="text-sm">{label}</span>
            </div>
            <div className="flex items-center gap-3">
                <Sparkline data={sparklineData} globalMax={globalMax} />
                <span className="w-16 text-right text-muted-foreground text-sm tabular-nums">{total.toLocaleString()}</span>
            </div>
        </div>
    );
};

export const AmsMetricsCard = () => {
    const { data: amsData, isLoading: isLoadingAms } = api.metrics.amsRecent.useQuery(undefined, {
        refetchInterval: 60_000, // 1 minute
        staleTime: 30_000,
    });

    const { data: workerData, isLoading: isLoadingWorker } = api.worker.metrics.useQuery(undefined, {
        refetchInterval: 60_000, // 1 minute
        staleTime: 30_000,
    });

    const isLoading = isLoadingAms || isLoadingWorker;

    const { metrics, globalMax } = useMemo((): { metrics: MetricRow[]; globalMax: number } => {
        if (!(amsData && workerData)) {
            return { metrics: [], globalMax: 10 };
        }

        // Generate 12 five-minute intervals for the last 60 minutes
        const now = new Date();
        const intervals: string[] = [];
        for (let i = 11; i >= 0; i--) {
            const interval = new Date(now.getTime() - i * 5 * 60 * 1000);
            // Round down to nearest 5 minutes
            interval.setMinutes(Math.floor(interval.getMinutes() / 5) * 5, 0, 0);
            intervals.push(interval.toISOString());
        }

        // Build maps for quick lookup
        const dataMaps: Record<string, Map<string, number>> = {};
        for (const entityType of ['campaign', 'adGroup', 'ad', 'target', 'spTraffic', 'spConversion'] as const) {
            dataMaps[entityType] = new Map();
            if (amsData.data[entityType]) {
                for (const point of amsData.data[entityType]) {
                    dataMaps[entityType].set(point.interval, point.count);
                }
            }
        }

        // Build sparklines and totals
        const campaignSparkline = intervals.map(i => dataMaps.campaign.get(i) ?? 0);
        const adGroupSparkline = intervals.map(i => dataMaps.adGroup.get(i) ?? 0);
        const adSparkline = intervals.map(i => dataMaps.ad.get(i) ?? 0);
        const targetSparkline = intervals.map(i => dataMaps.target.get(i) ?? 0);
        const trafficSparkline = intervals.map(i => dataMaps.spTraffic.get(i) ?? 0);
        const conversionSparkline = intervals.map(i => dataMaps.spConversion.get(i) ?? 0);

        // DLQ sparkline
        const dlqCurrent = workerData.dlq?.approximateVisible ?? 0;
        const dlqSparkline = new Array(12).fill(0) as number[];
        if (dlqCurrent > 0) {
            dlqSparkline[11] = dlqCurrent;
        }

        // Total metrics ingested - sum all entity types for each interval
        const totalIngestedSparkline = intervals.map(i => {
            return (
                (dataMaps.campaign.get(i) ?? 0) +
                (dataMaps.adGroup.get(i) ?? 0) +
                (dataMaps.ad.get(i) ?? 0) +
                (dataMaps.target.get(i) ?? 0) +
                (dataMaps.spTraffic.get(i) ?? 0) +
                (dataMaps.spConversion.get(i) ?? 0)
            );
        });

        // Calculate global max across all sparklines (minimum 10 to ensure tiny bars for zeros)
        const allValues = [...campaignSparkline, ...adGroupSparkline, ...adSparkline, ...targetSparkline, ...trafficSparkline, ...conversionSparkline, ...totalIngestedSparkline, ...dlqSparkline];
        const calculatedMax = Math.max(...allValues, 10);

        const lastActivity = amsData.lastActivity;

        return {
            globalMax: calculatedMax,
            metrics: [
                {
                    label: 'Campaigns',
                    entityType: 'campaign',
                    sparklineData: campaignSparkline,
                    total: campaignSparkline.reduce((sum, val) => sum + val, 0),
                    lastActivity: lastActivity?.campaign,
                },
                {
                    label: 'Ad Groups',
                    entityType: 'adGroup',
                    sparklineData: adGroupSparkline,
                    total: adGroupSparkline.reduce((sum, val) => sum + val, 0),
                    lastActivity: lastActivity?.adGroup,
                },
                {
                    label: 'Ads',
                    entityType: 'ad',
                    sparklineData: adSparkline,
                    total: adSparkline.reduce((sum, val) => sum + val, 0),
                    lastActivity: lastActivity?.ad,
                },
                {
                    label: 'Targets',
                    entityType: 'target',
                    sparklineData: targetSparkline,
                    total: targetSparkline.reduce((sum, val) => sum + val, 0),
                    lastActivity: lastActivity?.target,
                },
                {
                    label: 'Traffic',
                    entityType: 'spTraffic',
                    sparklineData: trafficSparkline,
                    total: trafficSparkline.reduce((sum, val) => sum + val, 0),
                    lastActivity: lastActivity?.spTraffic,
                },
                {
                    label: 'Conversions',
                    entityType: 'spConversion',
                    sparklineData: conversionSparkline,
                    total: conversionSparkline.reduce((sum, val) => sum + val, 0),
                    lastActivity: lastActivity?.spConversion,
                },
                {
                    label: 'Total Messages',
                    entityType: 'total' as const,
                    sparklineData: totalIngestedSparkline,
                    total: totalIngestedSparkline.reduce((sum, val) => sum + val, 0),
                },
                {
                    label: 'Error Messages',
                    entityType: 'dlq',
                    sparklineData: dlqSparkline,
                    total: dlqCurrent,
                },
            ],
        };
    }, [amsData, workerData]);

    if (isLoading) {
        return (
            <Card className="gap-0 space-y-0 p-3 pb-1">
                <div className="flex items-start justify-between pb-3 pl-1">
                    <div className="font-medium text-sm">AMS Metric Ingestion (60m)</div>
                </div>
                <div className="flex h-[144px] items-center justify-center">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            </Card>
        );
    }

    if (metrics.length === 0) {
        return (
            <Card className="gap-0 space-y-0 p-3 pb-1">
                <div className="flex items-start justify-between pb-3 pl-1">
                    <div className="font-medium text-sm">AMS Metric Ingestion (60m)</div>
                </div>
                <div className="flex h-[144px] items-center justify-center">
                    <p className="text-muted-foreground text-sm">No ingestion data available</p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="gap-0 space-y-0 p-3 pb-1">
            <div className="flex items-start justify-between pb-3 pl-1">
                <div className="font-medium text-sm">AMS Metric Ingestion (60m)</div>
            </div>
            <div className="grid grid-cols-1 gap-x-4 px-1 md:grid-cols-2">
                <div className="divide-y">
                    {metrics.slice(0, 4).map(metric => (
                        <MetricRow globalMax={globalMax} key={metric.entityType} label={metric.label} lastActivity={metric.lastActivity} sparklineData={metric.sparklineData} total={metric.total} />
                    ))}
                </div>
                <div className="divide-y">
                    {metrics.slice(4, 8).map(metric => (
                        <MetricRow globalMax={globalMax} key={metric.entityType} label={metric.label} lastActivity={metric.lastActivity} sparklineData={metric.sparklineData} total={metric.total} />
                    ))}
                </div>
            </div>
        </Card>
    );
};

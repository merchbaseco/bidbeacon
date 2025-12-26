import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { api } from '@/dashboard/lib/trpc';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';

type MetricRow = {
    label: string;
    entityType: 'campaign' | 'adGroup' | 'ad' | 'target' | 'spTraffic' | 'spConversion' | 'dlq' | 'total';
    sparklineData: number[];
    total: number;
};

const Sparkline = ({ data }: { data: number[] }) => {
    const chartData = useMemo(() => {
        return data.map((value, index) => ({
            value,
            index,
        }));
    }, [data]);

    const hasData = data.some(v => v > 0);

    if (!hasData) {
        return <div className="h-8 w-24 flex items-center justify-center text-xs text-muted-foreground">—</div>;
    }

    return (
        <div className="h-8 w-24">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

const MetricRow = ({ label, sparklineData, total }: { label: string; sparklineData: number[]; total: number }) => {
    return (
        <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="text-sm">{label}</span>
            </div>
            <div className="flex items-center gap-3">
                <Sparkline data={sparklineData} />
                <span className="text-sm text-muted-foreground tabular-nums w-16 text-right">{total.toLocaleString()}</span>
            </div>
        </div>
    );
};

export const AmsMetricsCard = () => {
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
        return {
            from: from.toISOString(),
            to: to.toISOString(),
        };
    }, []);

    const { data: amsData, isLoading: isLoadingAms } = api.metrics.amsHourly.useQuery(dateRange, {
        refetchInterval: 60000, // 1 minute
        staleTime: 30000,
    });

    const { data: workerData, isLoading: isLoadingWorker } = api.worker.metrics.useQuery(undefined, {
        refetchInterval: 60000, // 1 minute
        staleTime: 30000,
    });

    const isLoading = isLoadingAms || isLoadingWorker;

    const metrics = useMemo((): MetricRow[] => {
        if (!amsData || !workerData) {
            return [];
        }

        // Generate all 24 hourly intervals
        const now = new Date();
        const hours: string[] = [];
        for (let i = 23; i >= 0; i--) {
            const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
            hour.setMinutes(0, 0, 0);
            hours.push(hour.toISOString());
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
        const campaignSparkline = hours.map(h => dataMaps.campaign.get(h) ?? 0);
        const adGroupSparkline = hours.map(h => dataMaps.adGroup.get(h) ?? 0);
        const adSparkline = hours.map(h => dataMaps.ad.get(h) ?? 0);
        const targetSparkline = hours.map(h => dataMaps.target.get(h) ?? 0);
        const trafficSparkline = hours.map(h => dataMaps.spTraffic.get(h) ?? 0);
        const conversionSparkline = hours.map(h => dataMaps.spConversion.get(h) ?? 0);

        // DLQ sparkline - approximateVisible is the current queue size
        // We don't have 24-hour historical data, so we'll use the current value
        // and pad with zeros. Alternatively, we could use the last hour's sparkline
        // data (which is per-minute) and aggregate it, but for simplicity we'll
        // just show the current size
        const dlqCurrent = workerData.dlq?.approximateVisible ?? 0;
        const dlqSparkline = new Array(24).fill(0);
        // Set the most recent hour to current value
        if (dlqCurrent > 0) {
            dlqSparkline[23] = dlqCurrent;
        }

        // Total metrics ingested - sum all entity types for each hour
        const totalIngestedSparkline = hours.map(h => {
            return (
                (dataMaps.campaign.get(h) ?? 0) +
                (dataMaps.adGroup.get(h) ?? 0) +
                (dataMaps.ad.get(h) ?? 0) +
                (dataMaps.target.get(h) ?? 0) +
                (dataMaps.spTraffic.get(h) ?? 0) +
                (dataMaps.spConversion.get(h) ?? 0)
            );
        });

        return [
            {
                label: 'Campaign Changes',
                entityType: 'campaign',
                sparklineData: campaignSparkline,
                total: campaignSparkline.reduce((sum, val) => sum + val, 0),
            },
            {
                label: 'Ad Group Changes',
                entityType: 'adGroup',
                sparklineData: adGroupSparkline,
                total: adGroupSparkline.reduce((sum, val) => sum + val, 0),
            },
            {
                label: 'Ad Changes',
                entityType: 'ad',
                sparklineData: adSparkline,
                total: adSparkline.reduce((sum, val) => sum + val, 0),
            },
            {
                label: 'Target Changes',
                entityType: 'target',
                sparklineData: targetSparkline,
                total: targetSparkline.reduce((sum, val) => sum + val, 0),
            },
            {
                label: 'Traffic Datapoints',
                entityType: 'spTraffic',
                sparklineData: trafficSparkline,
                total: trafficSparkline.reduce((sum, val) => sum + val, 0),
            },
            {
                label: 'Conversion Datapoints',
                entityType: 'spConversion',
                sparklineData: conversionSparkline,
                total: conversionSparkline.reduce((sum, val) => sum + val, 0),
            },
            {
                label: 'Errors (DLQ)',
                entityType: 'dlq',
                sparklineData: dlqSparkline,
                total: dlqCurrent,
            },
            {
                label: 'Total Metrics Ingested',
                entityType: 'total' as const,
                sparklineData: totalIngestedSparkline,
                total: totalIngestedSparkline.reduce((sum, val) => sum + val, 0),
            },
        ];
    }, [amsData, workerData]);

    if (isLoading) {
        return (
            <Card className="p-3 pb-1 space-y-0 gap-0">
                <div className="flex items-center justify-center h-32">
                    <Spinner />
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-3 pb-1 space-y-0 gap-0">
            <div className="flex items-start justify-between pl-1 pb-1">
                <div>
                    <div className="text-sm font-medium">AMS Metrics (24h)</div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 px-1">
                <div className="col-span-1 divide-y">
                    {metrics.slice(0, 4).map(metric => (
                        <MetricRow key={metric.entityType} label={metric.label} sparklineData={metric.sparklineData} total={metric.total} />
                    ))}
                </div>
                <div className="col-span-1 divide-y">
                    {metrics.slice(4, 8).map(metric => (
                        <MetricRow key={metric.entityType} label={metric.label} sparklineData={metric.sparklineData} total={metric.total} />
                    ))}
                </div>
            </div>
        </Card>
    );
};


import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer } from 'recharts';
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

const Sparkline = ({ data }: { data: number[] }) => {
    const [fillColor, setFillColor] = useState('#66666F');

    useEffect(() => {
        // Get the computed color value from CSS variable
        const testEl = document.createElement('div');
        testEl.className = 'text-muted-foreground';
        testEl.style.visibility = 'hidden';
        testEl.style.position = 'absolute';
        document.body.appendChild(testEl);
        const color = getComputedStyle(testEl).color;
        document.body.removeChild(testEl);

        if (color && color !== 'rgba(0, 0, 0, 0)') {
            setFillColor(color);
        }
    }, []);

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
        <div className="h-6 w-18">
            <ResponsiveContainer width="100%" height="100%" debounce={300}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Bar dataKey="value" fill={fillColor} radius={[1, 1, 0, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// Format relative time like "2m ago" or "45m ago"
const formatRelativeTime = (isoString: string | undefined): string => {
    if (!isoString) return '—';
    const now = new Date();
    const then = new Date(isoString);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h`;
};

const MetricRow = ({ label, sparklineData, total, lastActivity }: { label: string; sparklineData: number[]; total: number; lastActivity?: string }) => {
    const isRecent = lastActivity && (new Date().getTime() - new Date(lastActivity).getTime()) < 5 * 60 * 1000; // Within 5 minutes

    return (
        <div className="flex items-center justify-between h-9">
            <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${isRecent ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
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
    const { data: amsData, isLoading: isLoadingAms } = api.metrics.amsRecent.useQuery(undefined, {
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
        const dlqSparkline = new Array(12).fill(0);
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

        const lastActivity = amsData.lastActivity;

        return [
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
            <div className="flex items-start justify-between pl-1 pb-3">
                <div>
                    <div className="text-sm font-medium">AMS Metric Ingestion (60m)</div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 px-1">
                <div className="divide-y">
                    {metrics.slice(0, 4).map(metric => (
                        <MetricRow key={metric.entityType} label={metric.label} sparklineData={metric.sparklineData} total={metric.total} lastActivity={metric.lastActivity} />
                    ))}
                </div>
                <div className="divide-y">
                    {metrics.slice(4, 8).map(metric => (
                        <MetricRow key={metric.entityType} label={metric.label} sparklineData={metric.sparklineData} total={metric.total} lastActivity={metric.lastActivity} />
                    ))}
                </div>
            </div>
        </Card>
    );
};

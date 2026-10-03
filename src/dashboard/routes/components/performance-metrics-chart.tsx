import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';
import { Area } from '@/dashboard/components/charts/area';
import { ComposedChart } from '@/dashboard/components/charts/composed-chart';
import { SeriesBar } from '@/dashboard/components/charts/series-bar';
import { ChartTooltip } from '@/dashboard/components/charts/tooltip';
import { XAxis } from '@/dashboard/components/charts/x-axis';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { cn } from '@/dashboard/lib/utils';
import { customRangeAtom, performanceRangeAtom } from '@/dashboard/state/performance-metrics-state';
import { Spinner } from '../../components/ui/spinner';
import { METRICS } from './performance-metrics-config';

type HourlyPerformanceData = RouterOutputs['metrics']['hourlyPerformance'];

type PerformanceMetricsChartProps = {
    data?: HourlyPerformanceData;
    isLoading: boolean;
    error: unknown;
    className?: string;
};

const CHARTED_METRICS = METRICS.filter(metric => metric.key === 'impressions' || metric.key === 'clicks' || metric.key === 'purchases');

const PerformanceMetricsChart = ({ data, isLoading, error, className }: PerformanceMetricsChartProps) => {
    const range = useAtomValue(performanceRangeAtom);
    const customRange = useAtomValue(customRangeAtom);
    const fallbackRange = useMemo(() => {
        if (customRange?.start && customRange?.end) {
            const customDates = normalizeLocalDateRange(customRange.start, customRange.end);
            if (customDates) {
                return { start: customDates.start.toISOString(), end: customDates.end.toISOString() };
            }
        }

        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        let start = todayStart;
        let end = todayEnd;

        if (range === 'yesterday') {
            start = new Date(todayStart);
            start.setDate(start.getDate() - 1);
            end = new Date(todayEnd);
            end.setDate(end.getDate() - 1);
        }

        if (range === 'this_week') {
            start = new Date(todayStart);
            start.setDate(start.getDate() - start.getDay());
        }

        if (range === 'this_month') {
            start = new Date(todayStart);
            start.setDate(1);
        }

        if (range === 'this_year') {
            start = new Date(todayStart);
            start.setMonth(0, 1);
        }

        if (range === 'last_30_days') {
            start = new Date(todayStart);
            start.setDate(start.getDate() - 29);
        }

        if (range === 'last_6_months') {
            start = new Date(todayStart);
            start.setMonth(start.getMonth() - 5, 1);
        }

        if (range === 'last_12_months') {
            start = new Date(todayStart);
            start.setMonth(start.getMonth() - 11, 1);
        }

        return { start: start.toISOString(), end: end.toISOString() };
    }, [customRange, range]);

    const resolvedRange = data?.range ?? fallbackRange;
    const resolvedGranularity = data?.granularity ?? 'hour';
    const resolvedTimezone = data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const legacyHourlyData = (data as { hourlyData?: Array<{ hour: number; hourLabel: string; impressions: number; clicks: number; purchases: number; spend: number; acos: number }> })?.hourlyData;

    const resolvedPoints = useMemo(() => {
        if (data?.points) {
            return data.points;
        }
        if (!legacyHourlyData) {
            return [];
        }

        const today = new Date();
        today.setMinutes(0, 0, 0);
        return legacyHourlyData.map(point => {
            const date = new Date(today);
            date.setHours(point.hour, 0, 0, 0);
            return {
                intervalStart: date.toISOString(),
                impressions: point.impressions,
                clicks: point.clicks,
                purchases: point.purchases,
                spend: Number(point.spend),
                acos: point.acos,
            };
        });
    }, [data?.points, legacyHourlyData]);

    const chartData = useMemo(() => {
        if (!data) {
            return [];
        }
        const tooltipDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: resolvedTimezone });
        const tooltipMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: resolvedTimezone });
        const tooltipHourFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: resolvedTimezone });

        return resolvedPoints.map(point => {
            const date = new Date(point.intervalStart);
            let tooltipLabel = tooltipDayFormatter.format(date);
            if (resolvedGranularity === 'hour') {
                tooltipLabel = `${tooltipDayFormatter.format(date)} · ${tooltipHourFormatter.format(date)}`;
            }
            if (resolvedGranularity === 'month') {
                tooltipLabel = tooltipMonthFormatter.format(date);
            }
            return { ...point, date, tooltipLabel };
        });
    }, [data, resolvedGranularity, resolvedPoints, resolvedTimezone]);

    const formatXLabel = useMemo(() => {
        const rangeStart = resolvedRange?.start ? new Date(resolvedRange.start) : null;
        const rangeEnd = resolvedRange?.end ? new Date(resolvedRange.end) : null;
        const spansYears = !!rangeStart && !!rangeEnd && rangeStart.getFullYear() !== rangeEnd.getFullYear();
        if (resolvedGranularity === 'hour') {
            return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: resolvedTimezone }).format;
        }
        if (resolvedGranularity === 'month') {
            return new Intl.DateTimeFormat('en-US', { month: 'short', year: spansYears ? '2-digit' : undefined, timeZone: resolvedTimezone }).format;
        }
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: resolvedTimezone }).format;
    }, [resolvedGranularity, resolvedRange?.end, resolvedRange?.start, resolvedTimezone]);

    const renderTooltip = useCallback(({ point }: { point: Record<string, unknown> }) => <PerformanceTooltip point={point} />, []);

    if (isLoading) {
        return (
            <div className={cn('w-full', className)}>
                <div className="flex h-[360px] items-center justify-center">
                    <Spinner className="size-6 text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={cn('w-full', className)}>
                <div className="flex h-[360px] items-center justify-center">
                    <div className="text-center">
                        <p className="text-muted-foreground text-sm">Unable to load performance data</p>
                        <p className="mt-1 text-muted-foreground/60 text-xs">{error instanceof Error ? error.message : 'Please try again later'}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn('w-full', className)}>
            <div className="relative h-[360px] w-full overflow-hidden">
                <ComposedChart aspectRatio="auto" className="h-full" data={chartData} formatXLabel={formatXLabel} margin={{ top: 20, right: 24, bottom: 28, left: 24 }}>
                    <SeriesBar dataKey="impressions" fill="var(--chart-bar)" radius={2} />
                    <Area dataKey="clicks" fill="var(--chart-line-primary)" fillOpacity={0.25} yAxisId="clicks" />
                    <Area dataKey="purchases" fill="var(--chart-line-secondary)" fillOpacity={0.25} yAxisId="purchases" />
                    <XAxis numTicks={resolvedGranularity === 'hour' ? 5 : 6} />
                    <ChartTooltip content={renderTooltip} />
                </ComposedChart>
            </div>
        </div>
    );
};

const normalizeLocalDateRange = (startValue: string, endValue: string) => {
    const start = parseLocalDateInput(startValue);
    const end = parseLocalDateInput(endValue);
    if (!(start && end)) {
        return null;
    }

    const normalized = start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start };
    normalized.start.setHours(0, 0, 0, 0);
    normalized.end.setHours(23, 59, 59, 999);
    return normalized;
};

const parseLocalDateInput = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!(year && month && day)) {
        return null;
    }
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
};

export { PerformanceMetricsChart };

const PerformanceTooltip = ({ point }: { point: Record<string, unknown> }) => {
    const heading = typeof point.tooltipLabel === 'string' ? point.tooltipLabel : undefined;
    return (
        <div className="min-w-[160px] px-3 py-2.5">
            {heading ? <div className="mb-2 font-medium text-chart-tooltip-foreground text-xs">{heading}</div> : null}
            <div className="space-y-1.5">
                {CHARTED_METRICS.map(metric => {
                    const value = point[metric.key];
                    if (typeof value !== 'number') {
                        return null;
                    }
                    return (
                        <div className="flex items-center justify-between gap-4" key={metric.key}>
                            <div className="flex items-center gap-1.5">
                                <span className="ink-dot" style={{ backgroundColor: metric.color ?? 'var(--chart-foreground-muted)' }} />
                                <span className="text-chart-tooltip-muted text-xs">{metric.label}</span>
                            </div>
                            <span className="font-medium text-chart-tooltip-foreground text-xs tabular-nums">{metric.formatter(value)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, Bar, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { cn } from '@/dashboard/lib/utils';
import { customRangeAtom, performanceRangeAtom } from '@/dashboard/state/performance-metrics-state';
import { Spinner } from '../../components/ui/spinner';
import { ChartHoverIndicator } from './chart-hover-indicator';
import { METRICS } from './performance-metrics-config';

type HoverState = {
    coordinate: { x: number; y: number };
    label: string;
};

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
    const chartRef = useRef<HTMLDivElement>(null);
    const [hoverState, setHoverState] = useState<HoverState | null>(null);

    const handleHoverChange = useCallback((state: HoverState | null) => {
        setHoverState(state);
    }, []);

    const handleChartLeave = useCallback(() => {
        setHoverState(null);
    }, []);

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
    const legacyLeadingHour = (data as { leadingHour?: { hour: number; hourLabel: string; impressions: number; clicks: number; purchases: number; spend: number; acos: number } })?.leadingHour;

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

    const resolvedLeadingPoint = useMemo(() => {
        if (data?.leadingPoint) {
            return data.leadingPoint;
        }
        if (!legacyLeadingHour) {
            return null;
        }
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(23, 0, 0, 0);
        return {
            intervalStart: yesterday.toISOString(),
            impressions: legacyLeadingHour.impressions,
            clicks: legacyLeadingHour.clicks,
            purchases: legacyLeadingHour.purchases,
            spend: Number(legacyLeadingHour.spend),
            acos: legacyLeadingHour.acos,
        };
    }, [data?.leadingPoint, legacyLeadingHour]);
    const hasLeadingPoint = Boolean(resolvedLeadingPoint);

    const chartData = useMemo(() => {
        if (!data) {
            return [];
        }
        const leading = resolvedLeadingPoint ? [resolvedLeadingPoint, ...resolvedPoints] : resolvedPoints;
        const rangeStart = resolvedRange?.start ? new Date(resolvedRange.start) : null;
        const rangeEnd = resolvedRange?.end ? new Date(resolvedRange.end) : null;
        const spansYears = !!rangeStart && !!rangeEnd && rangeStart.getFullYear() !== rangeEnd.getFullYear();

        const dayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: resolvedTimezone });
        const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: spansYears ? '2-digit' : undefined, timeZone: resolvedTimezone });
        const tooltipDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: resolvedTimezone });
        const tooltipMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: resolvedTimezone });
        const tooltipHourFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: resolvedTimezone });
        const hourLabelFormatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: resolvedTimezone });

        return leading.map(point => {
            const date = new Date(point.intervalStart);
            let label = '';
            let tooltipLabel = '';

            if (resolvedGranularity === 'hour') {
                const hourLabel = hourLabelFormatter.format(date);
                label = hourLabel;
                tooltipLabel = `${tooltipDayFormatter.format(date)} · ${tooltipHourFormatter.format(date)}`;
            }

            if (resolvedGranularity === 'day') {
                label = dayFormatter.format(date);
                tooltipLabel = tooltipDayFormatter.format(date);
            }

            if (resolvedGranularity === 'month') {
                label = monthFormatter.format(date);
                tooltipLabel = tooltipMonthFormatter.format(date);
            }

            return {
                ...point,
                label,
                tooltipLabel,
            };
        });
    }, [data, resolvedGranularity, resolvedLeadingPoint, resolvedPoints, resolvedRange?.end, resolvedRange?.start, resolvedTimezone]);

    const yAxisDomains = useMemo(() => {
        const points = resolvedPoints;
        const maxImpressions = Math.max(1, ...points.map(point => point.impressions));
        const maxClicks = Math.max(1, ...points.map(point => point.clicks));
        const maxPurchases = Math.max(1, ...points.map(point => point.purchases));
        return {
            impressions: [0, maxImpressions * 1.1] as [number, number],
            clicks: [0, maxClicks * 1.1] as [number, number],
            purchases: [0, maxPurchases * 1.1] as [number, number],
        };
    }, [resolvedPoints]);

    const isCustomRangeActive = Boolean(customRange?.start && customRange?.end);
    const isLiveRange = range === 'today' && !isCustomRangeActive;
    const isStreamingRange = isLiveRange && resolvedGranularity === 'hour';

    const currentHourLabel = useMemo(() => {
        if (!isLiveRange) {
            return null;
        }
        const now = new Date();
        return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: resolvedTimezone }).format(now);
    }, [isLiveRange, resolvedTimezone]);

    // Custom tick formatter for X axis - emphasize key labels without crowding
    const formatXAxisTick = (value: string, index: number) => {
        const totalTicks = chartData.length;
        if (hasLeadingPoint && index === 0) {
            return '';
        }

        if (resolvedGranularity === 'hour') {
            const highlightLabels = new Set(['00:00', '12:00', '23:00']);
            if (highlightLabels.has(value)) {
                return value;
            }
            if (range === 'today' && currentHourLabel && value === currentHourLabel) {
                return value;
            }
            return '';
        }

        if (totalTicks <= 6) {
            return value;
        }
        const interval = Math.ceil((totalTicks - 1) / 5);
        if (index % interval === 0 || index === totalTicks - 1) {
            return value;
        }
        return '';
    };

    const leadingOffsetPercent = hasLeadingPoint ? 3.5 : 0;
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
                {hasLeadingPoint ? <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" /> : null}

                <div className="absolute inset-0" ref={chartRef} style={hasLeadingPoint ? { left: `-${leadingOffsetPercent}%`, width: `calc(100% + ${leadingOffsetPercent}%)` } : undefined}>
                    {/* The wrapper's height is fixed in CSS, so declare it.
                        Recharts otherwise starts at -1x-1 and warns on the
                        first render, before its ResizeObserver reports. */}
                    <ResponsiveContainer height="100%" initialDimension={{ width: 0, height: 360 }} width="100%">
                        <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }} onMouseLeave={handleChartLeave}>
                            <defs>
                                <linearGradient id="clicksGradient" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="purchasesGradient" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            <XAxis axisLine={false} dataKey="label" interval={0} tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={formatXAxisTick} tickLine={false} />

                            <YAxis allowDataOverflow domain={yAxisDomains.impressions} hide yAxisId="impressions" />
                            <YAxis allowDataOverflow domain={yAxisDomains.clicks} hide yAxisId="clicks" />
                            <YAxis allowDataOverflow domain={yAxisDomains.purchases} hide yAxisId="purchases" />

                            {currentHourLabel ? <ReferenceLine stroke="#d1d5db" strokeDasharray="4 4" x={currentHourLabel} yAxisId="impressions" /> : null}

                            <Tooltip content={<CustomTooltip onHoverChange={handleHoverChange} />} cursor={{ fill: 'transparent' }} isAnimationActive={false} position={{ y: 12 }} />

                            <Bar
                                className="text-zinc-200 dark:text-zinc-800"
                                dataKey="impressions"
                                fill="currentColor"
                                isAnimationActive={false}
                                radius={[2, 2, 0, 0]}
                                yAxisId="impressions"
                                zIndex={0}
                            />

                            <Area dataKey="clicks" dot={false} fill="url(#clicksGradient)" isAnimationActive={false} stroke="#6366f1" strokeWidth={2} type="monotone" yAxisId="clicks" zIndex={1} />
                            <Area
                                dataKey="purchases"
                                dot={false}
                                fill="url(#purchasesGradient)"
                                isAnimationActive={false}
                                stroke="#10b981"
                                strokeWidth={2}
                                type="monotone"
                                yAxisId="purchases"
                                zIndex={2}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <ChartHoverIndicator active={!!hoverState} containerRef={chartRef} coordinate={hoverState?.coordinate} label={hoverState?.label} />
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

const CustomTooltip = ({
    active,
    payload,
    label,
    coordinate,
    onHoverChange,
}: {
    active?: boolean;
    payload?: Array<{
        dataKey: string;
        value: number;
        payload: { label?: string; tooltipLabel?: string } & Record<string, number | string>;
    }>;
    label?: string | number;
    coordinate?: { x: number; y: number };
    onHoverChange?: (state: HoverState | null) => void;
}) => {
    useEffect(() => {
        if (!onHoverChange) {
            return;
        }
        if (active && coordinate && label !== undefined) {
            onHoverChange({
                coordinate,
                label: typeof label === 'string' ? label : label.toString(),
            });
        } else {
            onHoverChange(null);
        }
    }, [active, coordinate, label, onHoverChange]);

    if (!(active && payload) || payload.length === 0) {
        return null;
    }

    const dataPoint = payload[0]?.payload;
    if (!dataPoint) {
        return null;
    }
    const heading = dataPoint.tooltipLabel ?? dataPoint.label ?? label;

    return (
        <div className="min-w-[160px] rounded-lg border border-border bg-card p-3 shadow-lg">
            <div className="mb-2 font-medium text-foreground text-sm">{heading}</div>
            <div className="space-y-1.5">
                {CHARTED_METRICS.map(metric => {
                    const value = dataPoint[metric.key];
                    if (typeof value !== 'number') {
                        return null;
                    }
                    return (
                        <div className="flex items-center justify-between gap-4" key={metric.key}>
                            <div className="flex items-center gap-1.5">
                                {metric.color ? (
                                    <span className="size-2 rounded-full" style={{ backgroundColor: metric.color }} />
                                ) : (
                                    <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                                )}
                                <span className="text-muted-foreground text-xs">{metric.label}</span>
                            </div>
                            <span className="font-medium text-xs">{metric.formatter(value)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

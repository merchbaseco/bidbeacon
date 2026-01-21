import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, Bar, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAtomValue } from 'jotai';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { cn } from '@/dashboard/lib/utils';
import { Spinner } from '../../components/ui/spinner';
import { performanceRangeAtom, customRangeAtom } from './performance-metrics-atoms';
import { METRICS } from './performance-metrics-config';
import { ChartHoverIndicator } from './chart-hover-indicator';

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

const CHARTED_METRICS = METRICS.filter(metric => metric.key === 'impressions' || metric.key === 'clicks' || metric.key === 'orders');

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
    const legacyHourlyData = (data as { hourlyData?: Array<{ hour: number; hourLabel: string; impressions: number; clicks: number; orders: number; spend: number; acos: number }> })
        ?.hourlyData;
    const legacyLeadingHour = (data as { leadingHour?: { hour: number; hourLabel: string; impressions: number; clicks: number; orders: number; spend: number; acos: number } })
        ?.leadingHour;

    const resolvedPoints = useMemo(() => {
        if (data?.points) return data.points;
        if (!legacyHourlyData) return [];

        const today = new Date();
        today.setMinutes(0, 0, 0);
        return legacyHourlyData.map(point => {
            const date = new Date(today);
            date.setHours(point.hour, 0, 0, 0);
            return {
                intervalStart: date.toISOString(),
                impressions: point.impressions,
                clicks: point.clicks,
                orders: point.orders,
                spend: Number(point.spend),
                acos: point.acos,
            };
        });
    }, [data?.points, legacyHourlyData]);

    const resolvedLeadingPoint = useMemo(() => {
        if (data?.leadingPoint) return data.leadingPoint;
        if (!legacyLeadingHour) return null;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(23, 0, 0, 0);
        return {
            intervalStart: yesterday.toISOString(),
            impressions: legacyLeadingHour.impressions,
            clicks: legacyLeadingHour.clicks,
            orders: legacyLeadingHour.orders,
            spend: Number(legacyLeadingHour.spend),
            acos: legacyLeadingHour.acos,
        };
    }, [data?.leadingPoint, legacyLeadingHour]);
    const hasLeadingPoint = Boolean(resolvedLeadingPoint);

    const chartData = useMemo(() => {
        if (!data) return [];
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
        const maxOrders = Math.max(1, ...points.map(point => point.orders));
        return {
            impressions: [0, maxImpressions * 1.1] as [number, number],
            clicks: [0, maxClicks * 1.1] as [number, number],
            orders: [0, maxOrders * 1.1] as [number, number],
        };
    }, [resolvedPoints]);

    const isCustomRangeActive = Boolean(customRange?.start && customRange?.end);
    const isLiveRange = range === 'today' && !isCustomRangeActive;
    const isStreamingRange = isLiveRange && resolvedGranularity === 'hour';

    const currentHourLabel = useMemo(() => {
        if (!isLiveRange) return null;
        const now = new Date();
        return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: resolvedTimezone }).format(now);
    }, [isLiveRange, resolvedTimezone]);

    // Custom tick formatter for X axis - emphasize key labels without crowding
    const formatXAxisTick = (value: string, index: number) => {
        const totalTicks = chartData.length;
        if (hasLeadingPoint && index === 0) return '';

        if (resolvedGranularity === 'hour') {
            const highlightLabels = new Set(['00:00', '12:00', '23:00']);
            if (highlightLabels.has(value)) return value;
            if (range === 'today' && currentHourLabel && value === currentHourLabel) return value;
            return '';
        }

        if (totalTicks <= 6) return value;
        const interval = Math.ceil((totalTicks - 1) / 5);
        if (index % interval === 0 || index === totalTicks - 1) return value;
        return '';
    };

    const leadingOffsetPercent = hasLeadingPoint ? 3.5 : 0;
    if (isLoading) {
        return (
            <div className={cn('w-full', className)}>
                <div className="flex items-center justify-center h-[360px]">
                    <Spinner className="size-6 text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={cn('w-full', className)}>
                <div className="flex items-center justify-center h-[360px]">
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">Unable to load performance data</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{error instanceof Error ? error.message : 'Please try again later'}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn('w-full', className)}>
            <div className="relative w-full h-[360px] overflow-hidden">
                {hasLeadingPoint ? <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" /> : null}

                <div
                    className="absolute inset-0"
                    style={hasLeadingPoint ? { left: `-${leadingOffsetPercent}%`, width: `calc(100% + ${leadingOffsetPercent}%)` } : undefined}
                    ref={chartRef}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }} onMouseLeave={handleChartLeave}>
                            <defs>
                                <linearGradient id="clicksGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={formatXAxisTick} interval={0} />

                            <YAxis yAxisId="impressions" hide domain={yAxisDomains.impressions} allowDataOverflow />
                            <YAxis yAxisId="clicks" hide domain={yAxisDomains.clicks} allowDataOverflow />
                            <YAxis yAxisId="orders" hide domain={yAxisDomains.orders} allowDataOverflow />

                            {currentHourLabel ? <ReferenceLine x={currentHourLabel} stroke="#d1d5db" strokeDasharray="4 4" yAxisId="impressions" /> : null}

                            <Tooltip content={<CustomTooltip onHoverChange={handleHoverChange} />} cursor={{ fill: 'transparent' }} isAnimationActive={false} position={{ y: 12 }} />

                            <Bar
                                yAxisId="impressions"
                                dataKey="impressions"
                                fill="currentColor"
                                className="text-zinc-200 dark:text-zinc-800"
                                radius={[2, 2, 0, 0]}
                                isAnimationActive={false}
                                zIndex={0}
                            />

                            <Area yAxisId="clicks" type="monotone" dataKey="clicks" stroke="#6366f1" strokeWidth={2} fill="url(#clicksGradient)" dot={false} isAnimationActive={false} zIndex={1} />
                            <Area yAxisId="orders" type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} fill="url(#ordersGradient)" dot={false} isAnimationActive={false} zIndex={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <ChartHoverIndicator active={!!hoverState} coordinate={hoverState?.coordinate} label={hoverState?.label} containerRef={chartRef} />
            </div>
        </div>
    );
};

const normalizeLocalDateRange = (startValue: string, endValue: string) => {
    const start = parseLocalDateInput(startValue);
    const end = parseLocalDateInput(endValue);
    if (!start || !end) return null;

    const normalized = start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start };
    normalized.start.setHours(0, 0, 0, 0);
    normalized.end.setHours(23, 59, 59, 999);
    return normalized;
};

const parseLocalDateInput = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
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
        if (!onHoverChange) return;
        if (active && coordinate && label !== undefined) {
            onHoverChange({
                coordinate,
                label: typeof label === 'string' ? label : label.toString(),
            });
        } else {
            onHoverChange(null);
        }
    }, [active, coordinate, label, onHoverChange]);

    if (!active || !payload || payload.length === 0) return null;

    const dataPoint = payload[0]?.payload;
    if (!dataPoint) return null;
    const heading = dataPoint.tooltipLabel ?? dataPoint.label ?? label;

    return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[160px]">
            <div className="text-sm font-medium text-foreground mb-2">{heading}</div>
            <div className="space-y-1.5">
                {CHARTED_METRICS.map(metric => {
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

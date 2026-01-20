import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, Bar, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronsUpDown } from 'lucide-react';
import { api } from '@/dashboard/lib/trpc';
import { cn } from '@/dashboard/lib/utils';
import { Button } from '../../components/ui/button';
import { Menu, MenuGroup, MenuGroupLabel, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { Spinner } from '../../components/ui/spinner';
import { useSelectedAccountId } from '../hooks/use-selected-accountid';
import { ChartHoverIndicator } from './chart-hover-indicator';

type MetricConfig = {
    key: 'impressions' | 'clicks' | 'orders' | 'spend' | 'acos';
    label: string;
    formatter: (value: number) => string;
    color?: string;
    isGood?: 'up' | 'down'; // Whether increase is good (up) or bad (down)
};

const METRICS: MetricConfig[] = [
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
        key: 'impressions',
        label: 'Impressions',
        formatter: value => value.toLocaleString(),
        isGood: 'up',
    },
    {
        key: 'spend',
        label: 'Spend',
        formatter: value => `$${value.toFixed(2)}`,
        isGood: 'down',
    },
    {
        key: 'acos',
        label: 'ACoS',
        formatter: value => `${value.toFixed(1)}%`,
        isGood: 'down',
    },
];

const PERIOD_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this_week', label: 'This week' },
    { value: 'this_month', label: 'This month' },
    { value: 'this_year', label: 'This year' },
] as const;

const RANGE_OPTIONS = [
    { value: 'last_30_days', label: '30 days' },
    { value: 'last_6_months', label: '6 months' },
    { value: 'last_12_months', label: '12 months' },
] as const;

const ALL_TIME_OPTION = { value: 'all_time', label: 'All time' } as const;

const ALL_RANGE_OPTIONS = [...PERIOD_OPTIONS, ...RANGE_OPTIONS, ALL_TIME_OPTION] as const;

type PerformanceRange = (typeof ALL_RANGE_OPTIONS)[number]['value'];

const MetricLabel = ({ metric, value, change }: { metric: MetricConfig; value: number; change: number }) => {
    const isPositiveChange = change > 0;
    const isGoodChange = metric.isGood === 'up' ? isPositiveChange : !isPositiveChange;
    const showDot = metric.color !== undefined;

    return (
        <div className="flex flex-col gap-0.5 shrink-0">
            <div className="flex items-center gap-1.5">
                <span className="text-xs md:text-sm text-muted-foreground">{metric.label}</span>
                {showDot && <span className="size-2 rounded-full" style={{ backgroundColor: metric.color }} />}
            </div>
            <div className="flex items-baseline gap-1 md:gap-2">
                <span className="text-lg md:text-2xl font-semibold tracking-tight">{metric.formatter(value)}</span>
                {change !== 0 && (
                    <span className={cn('text-xs md:text-sm font-medium', isGoodChange ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                        {isPositiveChange ? '+' : ''}
                        {change.toFixed(0)}%
                    </span>
                )}
            </div>
        </div>
    );
};

// Metrics that are displayed on the chart (for tooltip)
const CHARTED_METRICS = METRICS.filter(m => m.key === 'impressions' || m.key === 'clicks' || m.key === 'orders');
type HoverState = {
    coordinate: { x: number; y: number };
    label: string;
};

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

export const DailyPerformanceMetrics = ({ className }: { className?: string }) => {
    const accountId = useSelectedAccountId();
    const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
    const [range, setRange] = useState<PerformanceRange>('today');
    const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
    const [customRangeDraft, setCustomRangeDraft] = useState<{ start: string; end: string }>({ start: '', end: '' });
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

    const isCustomRangeActive = Boolean(customRange?.start && customRange?.end);

    const rangeConfig = useMemo(
        () => ({
            accountId: accountId!,
            timezone,
            range,
            customRange: isCustomRangeActive ? customRange : null,
        }),
        [accountId, customRange, isCustomRangeActive, range, timezone]
    );

    const isLiveRange = range === 'today' && !isCustomRangeActive;
    const refetchInterval = isLiveRange ? 60000 : 300000;
    const staleTime = isLiveRange ? 30000 : 120000;

    const { data, isLoading, error } = api.metrics.hourlyPerformance.useQuery(rangeConfig, {
        enabled: !!accountId,
        refetchInterval,
        staleTime,
    });

    const resolvedRange = data?.range ?? fallbackRange;
    const resolvedGranularity = data?.granularity ?? 'hour';
    const legacyHourlyData = (data as { hourlyData?: Array<{ hour: number; hourLabel: string; impressions: number; clicks: number; orders: number; spend: number; acos: number }> })?.hourlyData;
    const legacyLeadingHour = (data as { leadingHour?: { hour: number; hourLabel: string; impressions: number; clicks: number; orders: number; spend: number; acos: number } })?.leadingHour;

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

    const chartData = useMemo(() => {
        if (!data) return [];
        const leading = resolvedLeadingPoint ? [resolvedLeadingPoint, ...resolvedPoints] : resolvedPoints;
        const rangeStart = resolvedRange?.start ? new Date(resolvedRange.start) : null;
        const rangeEnd = resolvedRange?.end ? new Date(resolvedRange.end) : null;
        const spansYears = !!rangeStart && !!rangeEnd && rangeStart.getFullYear() !== rangeEnd.getFullYear();

        const dayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
        const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: spansYears ? '2-digit' : undefined });
        const tooltipDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const tooltipMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
        const tooltipHourFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

        return leading.map(point => {
            const date = new Date(point.intervalStart);
            let label = '';
            let tooltipLabel = '';

            if (resolvedGranularity === 'hour') {
                const hourLabel = `${date.getHours().toString().padStart(2, '0')}:00`;
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
    }, [data, resolvedGranularity, resolvedLeadingPoint, resolvedPoints, resolvedRange?.end, resolvedRange?.start]);

    // Calculate Y-axis domains from in-range data only (exclude leading hour)
    // This prevents leading context values from crushing the visible bars/lines
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

    const currentHourLabel = useMemo(() => {
        if (!isLiveRange) return null;
        const now = new Date();
        return `${now.getHours().toString().padStart(2, '0')}:00`;
    }, [isLiveRange]);

    // Custom tick formatter for X axis - emphasize key labels without crowding
    // Note: index 0 is the leading hour (yesterday's last hour), so actual hours start at index 1
    const formatXAxisTick = (value: string, index: number) => {
        const granularity = resolvedGranularity;
        const totalTicks = chartData.length;

        if (granularity === 'hour') {
            const isLeading = !!resolvedLeadingPoint && index === 0;
            if (isLeading) return '';
            if (value === '00:00') return value;
            if (range === 'today' && currentHourLabel && value === currentHourLabel) return value;
            if (range !== 'today' && value === '12:00') return value;
            if (value === '23:00') return value;
            return '';
        }

        if (totalTicks <= 6) return value;
        const interval = Math.ceil((totalTicks - 1) / 5);
        if (index % interval === 0 || index === totalTicks - 1) return value;
        return '';
    };

    const selectedRange = ALL_RANGE_OPTIONS.find(option => option.value === range);
    const rangeLabel = useMemo(() => {
        if (!resolvedRange?.start || !resolvedRange?.end) return '';
        const start = new Date(resolvedRange.start);
        const end = new Date(resolvedRange.end);
        const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (start.toDateString() === end.toDateString()) {
            return formatter.format(start);
        }
        return `${formatter.format(start)} – ${formatter.format(end)}`;
    }, [resolvedRange?.end, resolvedRange?.start]);

    const isStreamingRange = isLiveRange && resolvedGranularity === 'hour';

    const triggerLabel = isCustomRangeActive ? 'Custom range' : selectedRange?.label ?? 'Today';
    const canApplyCustomRange = Boolean(customRangeDraft.start && customRangeDraft.end);

    const header = (
        <>
            <div className="flex items-center justify-between px-4 max-w-background-frame-max mx-auto">
                <Menu>
                    <MenuTrigger
                        render={
                            <Button variant="outline" size="sm" className="rounded-full px-3 gap-2 text-sm font-medium">
                                {triggerLabel}
                                <ChevronsUpDown className="size-4 text-muted-foreground" />
                            </Button>
                        }
                    />
                    <MenuPopup className="w-[240px] overflow-x-hidden" align="start">
                        <MenuRadioGroup
                            value={range}
                            onValueChange={value => {
                                setRange(value as PerformanceRange);
                                setCustomRange(null);
                            }}
                        >
                            <MenuGroup>
                                <MenuGroupLabel>Period</MenuGroupLabel>
                                {PERIOD_OPTIONS.map(option => (
                                    <MenuRadioItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuRadioItem>
                                ))}
                            </MenuGroup>
                            <MenuSeparator />
                            <MenuGroup>
                                <MenuGroupLabel>Range</MenuGroupLabel>
                                {RANGE_OPTIONS.map(option => (
                                    <MenuRadioItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuRadioItem>
                                ))}
                            </MenuGroup>
                            <MenuSeparator />
                            <MenuRadioItem value={ALL_TIME_OPTION.value}>{ALL_TIME_OPTION.label}</MenuRadioItem>
                        </MenuRadioGroup>
                        <MenuSeparator />
                        <MenuGroup>
                            <MenuGroupLabel>Custom range</MenuGroupLabel>
                            <div className="mx-2 mb-2 flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 shadow-sm">
                                <label className="text-xs text-muted-foreground">Start</label>
                                <input
                                    type="date"
                                    value={customRangeDraft.start}
                                    onChange={event => setCustomRangeDraft(current => ({ ...current, start: event.target.value }))}
                                    className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-inner"
                                />
                                <label className="text-xs text-muted-foreground">End</label>
                                <input
                                    type="date"
                                    value={customRangeDraft.end}
                                    onChange={event => setCustomRangeDraft(current => ({ ...current, end: event.target.value }))}
                                    className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-inner"
                                />
                                <div className="flex min-w-0 gap-2">
                                    <Button
                                        size="sm"
                                        className="min-w-0 flex-1"
                                        disabled={!canApplyCustomRange}
                                        onClick={() => {
                                            if (!canApplyCustomRange) return;
                                            setCustomRange({
                                                start: customRangeDraft.start,
                                                end: customRangeDraft.end,
                                            });
                                        }}
                                    >
                                        Apply
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="min-w-0 flex-1"
                                        onClick={() => setCustomRange(null)}
                                        disabled={!isCustomRangeActive}
                                    >
                                        Clear
                                    </Button>
                                </div>
                            </div>
                        </MenuGroup>
                    </MenuPopup>
                </Menu>
                {rangeLabel ? <span className="text-xs text-muted-foreground">{rangeLabel}</span> : null}
            </div>
            <div className="flex items-start justify-start gap-6 md:gap-12 mb-4 px-4 max-w-background-frame-max mx-auto overflow-x-auto">
                {METRICS.map(metric => (
                    <MetricLabel key={metric.key} metric={metric} value={data?.totals?.[metric.key] ?? 0} change={data?.changes?.[metric.key] ?? 0} />
                ))}
            </div>
        </>
    );

    if (isLoading) {
        return (
            <div className={cn('w-full', className)}>
                {header}
                <div className="flex items-center justify-center h-[360px]">
                    <Spinner className="size-6 text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={cn('w-full', className)}>
                {header}
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
            {header}

            {/* Chart with fade effect - extends past left edge for streaming effect */}
            <div className="relative w-full h-[360px] overflow-hidden">
                {isStreamingRange ? <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" /> : null}

                {/* Chart shifted left so T-1 is mostly off-screen, centering today's data */}
                <div
                    className={cn('absolute inset-0', isStreamingRange ? '-left-[3.5%]' : 'left-0')}
                    style={isStreamingRange ? { width: 'calc(100% + 3.5%)' } : undefined}
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

                            {/* Hidden Y axes for each metric - domains based on in-range data only */}
                            {/* allowDataOverflow clips yesterday's leading bar if it exceeds today's scale */}
                            <YAxis yAxisId="impressions" hide domain={yAxisDomains.impressions} allowDataOverflow />
                            <YAxis yAxisId="clicks" hide domain={yAxisDomains.clicks} allowDataOverflow />
                            <YAxis yAxisId="orders" hide domain={yAxisDomains.orders} allowDataOverflow />

                            {/* Reference line for current hour */}
                            {currentHourLabel ? <ReferenceLine x={currentHourLabel} stroke="#d1d5db" strokeDasharray="4 4" yAxisId="impressions" /> : null}

                            <Tooltip content={<CustomTooltip onHoverChange={handleHoverChange} />} cursor={{ fill: 'transparent' }} />

                            {/* Impressions as bars - subtle gray (zIndex 0 = behind) */}
                            <Bar
                                yAxisId="impressions"
                                dataKey="impressions"
                                fill="currentColor"
                                className="text-zinc-200 dark:text-zinc-800"
                                radius={[2, 2, 0, 0]}
                                isAnimationActive={false}
                                zIndex={0}
                            />

                            {/* Area charts for clicks and orders with gradient fill (zIndex 1-2 = on top) */}
                            <Area yAxisId="clicks" type="monotone" dataKey="clicks" stroke="#6366f1" strokeWidth={2} fill="url(#clicksGradient)" dot={false} isAnimationActive={false} zIndex={1} />
                            <Area yAxisId="orders" type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} fill="url(#ordersGradient)" dot={false} isAnimationActive={false} zIndex={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <ChartHoverIndicator
                    active={!!hoverState}
                    coordinate={hoverState?.coordinate}
                    label={hoverState?.label}
                    containerRef={chartRef}
                />
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

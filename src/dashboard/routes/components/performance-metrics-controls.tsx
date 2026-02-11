import { useAtom, useAtomValue } from 'jotai';
import { ChevronsUpDown, XIcon } from 'lucide-react';
import { useId, useMemo } from 'react';
import { cn } from '@/dashboard/lib/utils';
import type { PerformanceEntityFilter } from '@/dashboard/state/performance-metrics-state';
import { customRangeAtom, customRangeDraftAtom, entityFiltersAtom, performanceRangeAtom } from '@/dashboard/state/performance-metrics-state';
import { ConnectionStatusBadge } from '../../components/connection-status-badge';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Menu, MenuGroup, MenuGroupLabel, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { connectionStatusAtom } from '../atoms';
import { ALL_RANGE_OPTIONS, METRICS, type MetricConfig, PERIOD_OPTIONS, type PerformanceRange, RANGE_OPTIONS } from './performance-metrics-config';

type PerformanceMetricsControlsProps = {
    totals?: {
        impressions: number;
        clicks: number;
        purchases: number;
        spend: number;
        acos: number;
    } | null;
    changes?: {
        impressions: number;
        clicks: number;
        purchases: number;
        spend: number;
        acos: number;
    } | null;
    range?: {
        start: string;
        end: string;
    } | null;
    timezone?: string;
};

const PerformanceMetricsControls = ({ totals, changes, range: dataRange, timezone }: PerformanceMetricsControlsProps) => {
    const connectionStatus = useAtomValue(connectionStatusAtom);
    const [range, setRange] = useAtom(performanceRangeAtom);
    const [customRange, setCustomRange] = useAtom(customRangeAtom);
    const [customRangeDraft, setCustomRangeDraft] = useAtom(customRangeDraftAtom);
    const [entityFilters, setEntityFilters] = useAtom(entityFiltersAtom);
    const startDateId = useId();
    const endDateId = useId();

    const isCustomRangeActive = Boolean(customRange?.start && customRange?.end);
    const selectedRange = ALL_RANGE_OPTIONS.find(option => option.value === range);
    const triggerLabel = isCustomRangeActive ? 'Custom range' : (selectedRange?.label ?? 'Today');
    const canApplyCustomRange = Boolean(customRangeDraft.start && customRangeDraft.end);
    const resolvedTimezone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

    const dateDisplay = useMemo(() => {
        const resolved = getResolvedRangeDates({
            range,
            customRange: isCustomRangeActive ? customRange : null,
            dataRange,
        });
        if (!resolved) {
            return null;
        }
        const isSingleDate = range === 'today' || range === 'yesterday' || isSameCalendarDay(resolved.start, resolved.end, resolvedTimezone);
        if (isSingleDate) {
            return formatSingleDate(resolved.start, resolvedTimezone);
        }
        return formatDateRange(resolved.start, resolved.end, resolvedTimezone);
    }, [customRange, dataRange, isCustomRangeActive, range, resolvedTimezone]);

    return (
        <div className="mx-auto max-w-background-frame-max px-4">
            <div className="mb-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Menu>
                                <MenuTrigger
                                    render={
                                        <Button className="gap-2 font-medium" variant="outline">
                                            {triggerLabel}
                                            <ChevronsUpDown className="size-4 text-muted-foreground" />
                                        </Button>
                                    }
                                />
                                <MenuPopup align="start" className="w-[260px] overflow-x-hidden">
                                    <MenuRadioGroup
                                        onValueChange={value => {
                                            setRange(value as PerformanceRange);
                                            setCustomRange(null);
                                        }}
                                        value={range}
                                    >
                                        <MenuGroup className="py-0.5">
                                            <MenuGroupLabel className="pb-1">Period</MenuGroupLabel>
                                            {PERIOD_OPTIONS.map(option => (
                                                <MenuRadioItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </MenuRadioItem>
                                            ))}
                                        </MenuGroup>
                                        <MenuSeparator className="my-2" />
                                        <MenuGroup className="py-0.5">
                                            <MenuGroupLabel className="pb-1">Range</MenuGroupLabel>
                                            {RANGE_OPTIONS.map(option => (
                                                <MenuRadioItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </MenuRadioItem>
                                            ))}
                                        </MenuGroup>
                                    </MenuRadioGroup>
                                    <MenuSeparator className="my-2" />
                                    <MenuGroup>
                                        <MenuGroupLabel className="pb-1">Custom range</MenuGroupLabel>
                                        <div className="mx-2 mb-2 flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 shadow-sm">
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="text-muted-foreground text-xs" htmlFor={startDateId}>
                                                    Start
                                                </label>
                                                <label className="text-muted-foreground text-xs" htmlFor={endDateId}>
                                                    End
                                                </label>
                                                <Input
                                                    className="min-w-0 text-sm"
                                                    id={startDateId}
                                                    onChange={event => setCustomRangeDraft(current => ({ ...current, start: event.target.value }))}
                                                    type="date"
                                                    value={customRangeDraft.start}
                                                />
                                                <Input
                                                    className="min-w-0 text-sm"
                                                    id={endDateId}
                                                    onChange={event => setCustomRangeDraft(current => ({ ...current, end: event.target.value }))}
                                                    type="date"
                                                    value={customRangeDraft.end}
                                                />
                                            </div>
                                            <div className="flex min-w-0 gap-2">
                                                <Button
                                                    className="min-w-0 flex-1"
                                                    disabled={!canApplyCustomRange}
                                                    onClick={() => {
                                                        if (!canApplyCustomRange) {
                                                            return;
                                                        }
                                                        setCustomRange({
                                                            start: customRangeDraft.start,
                                                            end: customRangeDraft.end,
                                                        });
                                                    }}
                                                    size="sm"
                                                >
                                                    Apply
                                                </Button>
                                                <Button className="min-w-0 flex-1" disabled={!isCustomRangeActive} onClick={() => setCustomRange(null)} size="sm" variant="ghost">
                                                    Clear
                                                </Button>
                                            </div>
                                        </div>
                                    </MenuGroup>
                                </MenuPopup>
                            </Menu>
                            {dateDisplay ? <span className="whitespace-nowrap text-muted-foreground/70 text-sm md:text-base">{dateDisplay}</span> : null}
                        </div>
                        {entityFilters.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                                {entityFilters.map(filter => (
                                    <Badge className="h-9 gap-2 rounded-lg pr-1 pl-3 font-medium text-sm sm:h-8" key={`${filter.type}-${filter.id}`} variant="outline">
                                        <span className="text-[0.7rem] text-muted-foreground uppercase tracking-wide">{getEntityFilterTypeLabel(filter.type)}</span>
                                        <span className="min-w-0 max-w-[160px] truncate font-medium text-sm" style={{ direction: 'rtl', unicodeBidi: 'plaintext' }} title={filter.label}>
                                            {filter.label}
                                        </span>
                                        <button
                                            aria-label={`Remove ${filter.label}`}
                                            className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                                            onClick={() => setEntityFilters(current => current.filter(item => !(item.id === filter.id && item.type === filter.type)))}
                                            type="button"
                                        >
                                            <XIcon className="size-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <ConnectionStatusBadge className="shrink-0" status={connectionStatus} />
                </div>
                <div className="mt-4 flex flex-wrap items-start gap-8 md:gap-12">
                    {METRICS.map(metric => (
                        <MetricLabel change={changes?.[metric.key] ?? 0} key={metric.key} metric={metric} value={totals?.[metric.key] ?? 0} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export { PerformanceMetricsControls };

const MetricLabel = ({ metric, value, change }: { metric: MetricConfig; value: number; change: number }) => {
    const isPositiveChange = change > 0;
    const isGoodChange = metric.isGood === 'up' ? isPositiveChange : !isPositiveChange;
    const showDot = metric.color !== undefined;

    return (
        <div className="flex shrink-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs md:text-sm">{metric.label}</span>
                {showDot && <span className="size-2 rounded-full" style={{ backgroundColor: metric.color }} />}
            </div>
            <div className="flex items-baseline gap-1 md:gap-2">
                <span className="font-semibold text-lg tracking-tight md:text-2xl">{metric.formatter(value)}</span>
                {change !== 0 && (
                    <span className={cn('font-medium text-xs md:text-sm', isGoodChange ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                        {isPositiveChange ? '+' : ''}
                        {change.toFixed(0)}%
                    </span>
                )}
            </div>
        </div>
    );
};

const getEntityFilterTypeLabel = (type: PerformanceEntityFilter['type']) => {
    switch (type) {
        case 'adGroup':
            return 'Ad group';
        case 'campaign':
            return 'Campaign';
        case 'ad':
            return 'Ad';
        case 'target':
            return 'Target';
        default:
            return 'Entity';
    }
};

const getResolvedRangeDates = ({
    range,
    customRange,
    dataRange,
}: {
    range: PerformanceRange;
    customRange: { start: string; end: string } | null;
    dataRange?: { start: string; end: string } | null;
}) => {
    if (dataRange?.start && dataRange?.end) {
        return {
            start: new Date(dataRange.start),
            end: new Date(dataRange.end),
        };
    }

    if (customRange?.start && customRange?.end) {
        const parsedStart = parseLocalDateInput(customRange.start);
        const parsedEnd = parseLocalDateInput(customRange.end);
        if (!(parsedStart && parsedEnd)) {
            return null;
        }
        return parsedStart.getTime() <= parsedEnd.getTime() ? { start: parsedStart, end: parsedEnd } : { start: parsedEnd, end: parsedStart };
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

    return { start, end };
};

const parseLocalDateInput = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!(year && month && day)) {
        return null;
    }
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isSameCalendarDay = (start: Date, end: Date, timezone: string) => {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(start) === formatter.format(end);
};

const formatSingleDate = (date: Date, timezone: string) => {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone }).format(date);
};

const formatDateRange = (start: Date, end: Date, timezone: string) => {
    const yearFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: timezone });
    const monthDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
    const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: timezone });
    const monthDayYearFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone });
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timezone });

    const startYear = yearFormatter.format(start);
    const endYear = yearFormatter.format(end);
    const startMonth = monthFormatter.format(start);
    const endMonth = monthFormatter.format(end);

    if (startYear === endYear) {
        if (startMonth === endMonth) {
            return `${monthDayFormatter.format(start)}–${dayFormatter.format(end)}, ${endYear}`;
        }
        return `${monthDayFormatter.format(start)}–${monthDayFormatter.format(end)}, ${endYear}`;
    }

    return `${monthDayYearFormatter.format(start)}–${monthDayYearFormatter.format(end)}`;
};

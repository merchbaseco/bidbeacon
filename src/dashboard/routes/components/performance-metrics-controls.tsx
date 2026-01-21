import { ChevronsUpDown, XIcon } from 'lucide-react';
import { useAtom, useAtomValue } from 'jotai';
import { cn } from '@/dashboard/lib/utils';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConnectionStatusBadge } from '../../components/connection-status-badge';
import { Menu, MenuGroup, MenuGroupLabel, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { connectionStatusAtom } from '../atoms';
import { ALL_RANGE_OPTIONS, METRICS, PERIOD_OPTIONS, RANGE_OPTIONS, type MetricConfig, type PerformanceRange } from './performance-metrics-config';
import { customRangeAtom, customRangeDraftAtom, entityFiltersAtom, performanceRangeAtom } from './performance-metrics-atoms';

type PerformanceMetricsControlsProps = {
    totals?: {
        impressions: number;
        clicks: number;
        orders: number;
        spend: number;
        acos: number;
    } | null;
    changes?: {
        impressions: number;
        clicks: number;
        orders: number;
        spend: number;
        acos: number;
    } | null;
};

const PerformanceMetricsControls = ({ totals, changes }: PerformanceMetricsControlsProps) => {
    const connectionStatus = useAtomValue(connectionStatusAtom);
    const [range, setRange] = useAtom(performanceRangeAtom);
    const [customRange, setCustomRange] = useAtom(customRangeAtom);
    const [customRangeDraft, setCustomRangeDraft] = useAtom(customRangeDraftAtom);
    const [entityFilters, setEntityFilters] = useAtom(entityFiltersAtom);

    const isCustomRangeActive = Boolean(customRange?.start && customRange?.end);
    const selectedRange = ALL_RANGE_OPTIONS.find(option => option.value === range);
    const triggerLabel = isCustomRangeActive ? 'Custom range' : selectedRange?.label ?? 'Today';
    const canApplyCustomRange = Boolean(customRangeDraft.start && customRangeDraft.end);

    return (
        <div className="max-w-background-frame-max mx-auto px-4">
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Menu>
                            <MenuTrigger
                                render={
                                    <Button variant="outline" size="sm" className="rounded-full px-3 gap-2 text-sm font-medium">
                                        {triggerLabel}
                                        <ChevronsUpDown className="size-4 text-muted-foreground" />
                                    </Button>
                                }
                            />
                            <MenuPopup className="w-[260px] overflow-x-hidden" align="start">
                                <MenuRadioGroup
                                    value={range}
                                    onValueChange={value => {
                                        setRange(value as PerformanceRange);
                                        setCustomRange(null);
                                    }}
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
                                            <label className="text-xs text-muted-foreground">Start</label>
                                            <label className="text-xs text-muted-foreground">End</label>
                                            <input
                                                type="date"
                                                value={customRangeDraft.start}
                                                onChange={event => setCustomRangeDraft(current => ({ ...current, start: event.target.value }))}
                                                className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-inner"
                                            />
                                            <input
                                                type="date"
                                                value={customRangeDraft.end}
                                                onChange={event => setCustomRangeDraft(current => ({ ...current, end: event.target.value }))}
                                                className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-inner"
                                            />
                                        </div>
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
                        {entityFilters.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                                {entityFilters.map(filter => (
                                    <Badge
                                        key={`${filter.type}-${filter.id}`}
                                        variant="outline"
                                        className="h-8 rounded-full gap-2 pl-3 pr-1 text-sm font-medium sm:h-7"
                                    >
                                        <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{filter.type}</span>
                                        <span
                                            className="min-w-0 max-w-[160px] truncate text-sm font-medium"
                                            style={{ direction: 'rtl', unicodeBidi: 'plaintext' }}
                                            title={filter.label}
                                        >
                                            {filter.label}
                                        </span>
                                        <button
                                            type="button"
                                            className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                                            onClick={() =>
                                                setEntityFilters(current => current.filter(item => !(item.id === filter.id && item.type === filter.type)))
                                            }
                                            aria-label={`Remove ${filter.label}`}
                                        >
                                            <XIcon className="size-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <ConnectionStatusBadge status={connectionStatus} className="shrink-0" />
                </div>
                <div className="mt-4 flex flex-wrap items-start gap-8 md:gap-12">
                    {METRICS.map(metric => (
                        <MetricLabel
                            key={metric.key}
                            metric={metric}
                            value={totals?.[metric.key] ?? 0}
                            change={changes?.[metric.key] ?? 0}
                        />
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
        <div className="flex flex-col gap-0.5 shrink-0">
            <div className="flex items-center gap-1.5">
                <span className="text-xs md:text-sm text-muted-foreground">{metric.label}</span>
                {showDot && <span className="size-2 rounded-full" style={{ backgroundColor: metric.color }} />}
            </div>
            <div className="flex items-baseline gap-1 md:gap-2">
                <span className="text-lg md:text-2xl font-semibold tracking-tight">{metric.formatter(value)}</span>
                {change !== 0 && (
                    <span
                        className={cn(
                            'text-xs md:text-sm font-medium',
                            isGoodChange ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                        )}
                    >
                        {isPositiveChange ? '+' : ''}
                        {change.toFixed(0)}%
                    </span>
                )}
            </div>
        </div>
    );
};

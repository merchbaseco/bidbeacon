import { subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { Badge } from '@/dashboard/components/ui/badge';
import { Frame, FrameFooter } from '@/dashboard/components/ui/frame';
import { Input } from '@/dashboard/components/ui/input';
import { ScrollArea } from '@/dashboard/components/ui/scroll-area';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/dashboard/components/ui/select';
import { Skeleton } from '@/dashboard/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/dashboard/components/ui/table';
import { Toggle, ToggleGroup } from '@/dashboard/components/ui/toggle-group';
import { useSelectedAccountId } from '@/dashboard/routes/hooks/use-selected-accountid';
import { useSelectedCountryCode } from '@/dashboard/routes/hooks/use-selected-country-code';
import { usePerformanceTable } from '@/dashboard/routes/hooks/use-performance-table';
import type { PerformanceEntityFilter } from '@/dashboard/routes/components/performance-metrics-atoms';
import { entityFiltersAtom } from '@/dashboard/routes/components/performance-metrics-atoms';
import { getTimezoneForCountry } from '@/utils/timezones';
import type { PerformanceDimension, PerformanceTableOutput } from '@/types/performance-api';

const PerformanceTable = ({ className }: { className?: string }) => {
    const accountId = useSelectedAccountId();
    const countryCode = useSelectedCountryCode();
    const [dimension, setDimension] = useState<PerformanceDimension>('campaign');
    const [rangePreset, setRangePreset] = useState<RangePreset>('last_30');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [adProductFilter, setAdProductFilter] = useState('all');
    const [, setEntityFilters] = useAtom(entityFiltersAtom);

    if (!accountId || !countryCode) {
        return null;
    }

    const timezone = useMemo(() => getTimezoneForCountry(countryCode), [countryCode]);
    const presetRange = useMemo(() => {
        const now = new Date();
        const days = rangePreset === 'last_7' ? 6 : 29;
        const start = subDays(now, days);

        return {
            startDate: formatInTimeZone(start, timezone, 'MM-dd-yyyy'),
            endDate: formatInTimeZone(now, timezone, 'MM-dd-yyyy'),
        };
    }, [rangePreset, timezone]);

    const isCustomRangeValid = isValidDateString(customStart) && isValidDateString(customEnd);
    const range = useMemo(
        () => (rangePreset === 'custom' && isCustomRangeValid ? { startDate: customStart, endDate: customEnd } : presetRange),
        [rangePreset, isCustomRangeValid, customStart, customEnd, presetRange]
    );

    const filters = useMemo(
        () => ({
            state: statusFilter !== 'all' ? statusFilter : undefined,
            adProduct: adProductFilter !== 'all' ? adProductFilter : undefined,
        }),
        [statusFilter, adProductFilter]
    );

    const { data, isLoading, isFetching } = usePerformanceTable({
        accountId,
        range,
        dimension,
        metricsEntityType: 'target',
        filters,
        enabled: rangePreset !== 'custom' || isCustomRangeValid,
    });

    const rows = data?.rows ?? [];
    const isEmpty = !isLoading && rows.length === 0;
    const addEntityFilter = (filter: PerformanceEntityFilter) => {
        setEntityFilters(current => {
            if (current.some(item => item.type === filter.type && item.id === filter.id)) {
                return current;
            }
            return [...current, filter];
        });
    };

    return (
        <div className={className ?? ''}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold">Performance table</p>
                    <p className="text-xs text-muted-foreground">
                        {rangePreset === 'custom' && !isCustomRangeValid ? 'Enter a custom date range' : `${range.startDate} - ${range.endDate}`} · Target metrics
                    </p>
                </div>
                {isFetching && !isLoading ? <span className="text-xs text-muted-foreground">Refreshing…</span> : null}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Select aria-label="Select dimension" value={dimension} onValueChange={value => value && setDimension(value as PerformanceDimension)}>
                    <SelectTrigger size="sm" className="w-[150px] text-xs md:text-sm h-7">
                        <SelectValue>
                            {value => DIMENSION_OPTIONS.find(option => option.value === value)?.label ?? 'Dimension'}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                        {DIMENSION_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectPopup>
                </Select>
                <ToggleGroup
                    type="single"
                    value={rangePreset}
                    onValueChange={value => value && setRangePreset(value as RangePreset)}
                    size="sm"
                    variant="outline"
                >
                    <Toggle value="last_7">Last 7</Toggle>
                    <Toggle value="last_30">Last 30</Toggle>
                    <Toggle value="custom">Custom</Toggle>
                </ToggleGroup>
                {rangePreset === 'custom' ? (
                    <div className="flex items-center gap-2">
                        <Input
                            size="sm"
                            placeholder="MM-DD-YYYY"
                            value={customStart}
                            onChange={event => setCustomStart(event.target.value)}
                            className="w-[130px] text-xs"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                            size="sm"
                            placeholder="MM-DD-YYYY"
                            value={customEnd}
                            onChange={event => setCustomEnd(event.target.value)}
                            className="w-[130px] text-xs"
                        />
                    </div>
                ) : null}
                <Select aria-label="Select status" value={statusFilter} onValueChange={value => value && setStatusFilter(value)}>
                    <SelectTrigger size="sm" className="w-[140px] text-xs md:text-sm h-7">
                        <SelectValue>
                            {value => STATUS_OPTIONS.find(option => option.value === value)?.label ?? 'Status'}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                        {STATUS_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectPopup>
                </Select>
                <Select aria-label="Select ad product" value={adProductFilter} onValueChange={value => value && setAdProductFilter(value)}>
                    <SelectTrigger size="sm" className="w-[180px] text-xs md:text-sm h-7">
                        <SelectValue>
                            {value => AD_PRODUCT_OPTIONS.find(option => option.value === value)?.label ?? 'Ad product'}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                        {AD_PRODUCT_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectPopup>
                </Select>
            </div>
            <Frame className="w-full">
                <Table className="table-fixed">
                    <colgroup>
                        <col />
                        {COLUMN_WIDTHS.map(width => (
                            <col key={width} className={width} />
                        ))}
                    </colgroup>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{getPrimaryColumnLabel(dimension)}</TableHead>
                            <TableHead className="max-w-[80px] w-[80px]">Status</TableHead>
                            <TableHead className="text-right">Spend</TableHead>
                            <TableHead className="text-right">Sales</TableHead>
                            <TableHead className="text-right">Orders</TableHead>
                            <TableHead className="text-right">ACOS</TableHead>
                            <TableHead className="text-right">ROAS</TableHead>
                        </TableRow>
                    </TableHeader>
                </Table>
                <div className="relative rounded-xl border border-border bg-background bg-clip-padding shadow-xs before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:bg-clip-border dark:before:shadow-[0_-1px_--theme(--color-white/8%)]">
                    <ScrollArea
                        className="h-[520px] max-h-[520px] [&_[data-slot=scroll-area-scrollbar]]:hidden"
                        scrollFade
                        allowScrollChaining
                    >
                        <Table className="table-fixed">
                            <colgroup>
                                <col />
                                {COLUMN_WIDTHS.map(width => (
                                    <col key={width} className={width} />
                                ))}
                            </colgroup>
                            <TableBody className="before:hidden">
                                {rangePreset === 'custom' && !isCustomRangeValid ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                                            Enter a start and end date in MM-DD-YYYY to load results.
                                        </TableCell>
                                </TableRow>
                            ) : isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10">
                                        <div className="space-y-3">
                                            {Array.from({ length: 4 }).map((_, index) => (
                                                <div key={index} className="flex items-center justify-between gap-3">
                                                    <Skeleton className="h-4 w-48" />
                                                    <Skeleton className="h-4 w-16" />
                                                    <Skeleton className="h-4 w-20" />
                                                    <Skeleton className="h-4 w-20" />
                                                    <Skeleton className="h-4 w-16" />
                                                    <Skeleton className="h-4 w-16" />
                                                    <Skeleton className="h-4 w-16" />
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : isEmpty ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                                        No campaign performance data found for this range.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map(row => {
                                    if (row.dimension !== dimension) return null;

                                    const filter = getEntityFilterForRow(row);

                                    return (
                                        <TableRow key={getRowKey(row)}>
                                            <TableCell className="font-medium">
                                                {filter ? (
                                                    <button
                                                        type="button"
                                                        className="group flex w-full min-w-0 flex-col text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
                                                        onClick={() => addEntityFilter(filter)}
                                                        aria-label={`Filter chart by ${filter.label}`}
                                                    >
                                                        {renderPrimaryCell(row)}
                                                    </button>
                                                ) : (
                                                    <div className="min-w-0 w-full">{renderPrimaryCell(row)}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-[80px] w-[80px]">{renderStatus(row.state)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.metrics.spend)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.metrics.sales)}</TableCell>
                                            <TableCell className="text-right">{formatNumber(row.metrics.orders)}</TableCell>
                                            <TableCell className="text-right">{formatPercent(row.metrics.acos)}</TableCell>
                                            <TableCell className="text-right">{formatRatio(row.metrics.roas)}</TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </div>
                {rows.length > 0 ? (
                    <FrameFooter className="px-3 py-2 text-xs text-muted-foreground">
                        Showing {rows.length} {getFooterLabel(dimension)} by spend
                    </FrameFooter>
                ) : null}
            </Frame>
        </div>
    );
};

const renderStatus = (state: string) => {
    const normalized = state.toLowerCase();
    const dotClass =
        normalized === 'enabled'
            ? 'bg-emerald-500'
            : normalized === 'paused'
              ? 'bg-amber-500'
              : normalized === 'archived'
                ? 'bg-muted-foreground/50'
                : 'bg-slate-400';

    return (
        <Badge variant="outline">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${dotClass}`} />
            {state}
        </Badge>
    );
};

const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
    }).format(value);
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
};

const formatPercent = (value: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value);
};

const formatRatio = (value: number) => {
    return `${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)}x`;
};

const getPrimaryColumnLabel = (dimension: PerformanceDimension) => {
    switch (dimension) {
        case 'adGroup':
            return 'Ad group';
        case 'ad':
            return 'Ad';
        case 'target':
            return 'Target';
        default:
            return 'Campaign';
    }
};

const getFooterLabel = (dimension: PerformanceDimension) => {
    switch (dimension) {
        case 'adGroup':
            return 'ad groups';
        case 'ad':
            return 'ads';
        case 'target':
            return 'targets';
        default:
            return 'campaigns';
    }
};

const getRowKey = (row: { dimension: PerformanceDimension } & Record<string, unknown>) => {
    if (row.dimension === 'campaign') return String(row.campaignId);
    if (row.dimension === 'adGroup') return String(row.adGroupId);
    if (row.dimension === 'ad') return String(row.adId);
    return String(row.targetId);
};

const getEntityFilterForRow = (row: PerformanceTableRow): PerformanceEntityFilter | null => {
    switch (row.dimension) {
        case 'campaign':
            return {
                type: 'campaign',
                id: row.campaignId,
                label: row.name ?? row.campaignId,
                description: row.campaignId,
            };
        case 'adGroup':
            return {
                type: 'adGroup',
                id: row.adGroupId,
                label: row.name ?? row.adGroupId,
                description: row.adGroupId,
            };
        case 'ad': {
            const label = row.productAsin ?? row.adId;
            return {
                type: 'ad',
                id: row.adId,
                label,
                description: row.productAsin ? row.adId : null,
            };
        }
        case 'target': {
            const description = row.targetMatchType ? `${row.targetType} · ${row.targetMatchType}` : row.targetType;
            return {
                type: 'target',
                id: row.targetId,
                label: row.targetDisplay ?? row.targetId,
                description,
            };
        }
    }
};

const renderPrimaryCell = (row: {
    dimension: PerformanceDimension;
    name?: string;
    campaignId?: string;
    adGroupId?: string;
    adId?: string;
    productAsin?: string | null;
    targetDisplay?: string;
    targetId?: string;
    targetType?: string;
}) => {
    if (row.dimension === 'campaign') {
        return (
            <div className="flex min-w-0 flex-col">
                <span className="truncate">{row.name ?? row.campaignId}</span>
                <span className="truncate text-xs text-muted-foreground">{row.campaignId}</span>
            </div>
        );
    }

    if (row.dimension === 'adGroup') {
        return (
            <div className="flex min-w-0 flex-col">
                <span className="truncate">{row.name ?? row.adGroupId}</span>
                <span className="truncate text-xs text-muted-foreground">{row.adGroupId}</span>
            </div>
        );
    }

    if (row.dimension === 'ad') {
        return (
            <div className="flex min-w-0 flex-col">
                <span className="truncate">{row.productAsin ?? row.adId}</span>
                <span className="truncate text-xs text-muted-foreground">{row.adId}</span>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col">
            <span className="truncate">{row.targetDisplay ?? row.targetId}</span>
            <span className="truncate text-xs text-muted-foreground">{row.targetType ?? 'Target'}</span>
        </div>
    );
};

const isValidDateString = (value: string) => /^\d{2}-\d{2}-\d{4}$/.test(value);

type RangePreset = 'last_7' | 'last_30' | 'custom';
type PerformanceTableRow = PerformanceTableOutput['rows'][number];

const DIMENSION_OPTIONS = [
    { value: 'campaign', label: 'Campaigns' },
    { value: 'adGroup', label: 'Ad groups' },
    { value: 'ad', label: 'Ads' },
    { value: 'target', label: 'Targets' },
] as const;

const STATUS_OPTIONS = [
    { value: 'all', label: 'All status' },
    { value: 'ENABLED', label: 'Enabled' },
    { value: 'PAUSED', label: 'Paused' },
    { value: 'ARCHIVED', label: 'Archived' },
] as const;

const AD_PRODUCT_OPTIONS = [
    { value: 'all', label: 'All products' },
    { value: 'SPONSORED_PRODUCTS', label: 'Sponsored Products' },
    { value: 'SPONSORED_BRANDS', label: 'Sponsored Brands' },
    { value: 'SPONSORED_DISPLAY', label: 'Sponsored Display' },
    { value: 'SPONSORED_TELEVISION', label: 'Sponsored TV' },
    { value: 'AMAZON_DSP', label: 'Amazon DSP' },
] as const;

const COLUMN_WIDTHS = ['w-[80px]', 'w-[110px]', 'w-[110px]', 'w-[110px]', 'w-[110px]', 'w-[110px]'] as const;

export { PerformanceTable };

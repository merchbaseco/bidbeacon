import { formatInTimeZone } from 'date-fns-tz';
import { useAtom, useAtomValue } from 'jotai';
import { useDeferredValue, useMemo, useState } from 'react';
import { Badge } from '@/dashboard/components/ui/badge';
import { Button } from '@/dashboard/components/ui/button';
import { Frame, FrameFooter } from '@/dashboard/components/ui/frame';
import { Input } from '@/dashboard/components/ui/input';
import { ScrollArea } from '@/dashboard/components/ui/scroll-area';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/dashboard/components/ui/select';
import { Skeleton } from '@/dashboard/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/dashboard/components/ui/table';
import { EntityDetailsDialog } from '@/dashboard/routes/components/entity-details-dialog';
import type { PerformanceRange } from '@/dashboard/routes/components/performance-metrics-config';
import { usePerformanceTable } from '@/dashboard/routes/hooks/use-performance-table';
import { useSelectedAccountId } from '@/dashboard/routes/hooks/use-selected-accountid';
import { useSelectedCountryCode } from '@/dashboard/routes/hooks/use-selected-country-code';
import type { PerformanceEntityFilter } from '@/dashboard/state/performance-metrics-state';
import { customRangeAtom, entityFiltersAtom, performanceRangeAtom } from '@/dashboard/state/performance-metrics-state';
import { getPerformanceRange } from '@/lib/performance-range';
import type { PerformanceDimension, PerformanceTableOutput } from '@/types/performance-api';
import { getTimezoneForCountry } from '@/utils/timezones';

const TABLE_SKELETON_ROW_IDS = Array.from({ length: 12 }, (_, index) => `performance-table-row-${index}`);

const PerformanceTable = ({ className }: { className?: string }) => {
    const accountId = useSelectedAccountId();
    const countryCode = useSelectedCountryCode();

    if (!(accountId && countryCode)) {
        return null;
    }

    return <PerformanceTableContent accountId={accountId} className={className} countryCode={countryCode} />;
};

const PerformanceTableContent = ({ accountId, className, countryCode }: { accountId: string; className?: string; countryCode: string }) => {
    const [dimension, setDimension] = useState<PerformanceDimension>('campaign');
    const [statusFilter, setStatusFilter] = useState('all');
    const [adProductFilter, setAdProductFilter] = useState('all');
    const [searchInput, setSearchInput] = useState('');
    const [detailsRow, setDetailsRow] = useState<PerformanceTableRow | null>(null);
    const deferredSearchInput = useDeferredValue(searchInput);
    const forceSkeleton = useMemo(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return new URLSearchParams(window.location.search).has('showSkeleton');
    }, []);
    const [, setEntityFilters] = useAtom(entityFiltersAtom);
    const range = useAtomValue(performanceRangeAtom);
    const customRange = useAtomValue(customRangeAtom);

    const timezone = useMemo(() => getTimezoneForCountry(countryCode), [countryCode]);
    const tableRange = useMemo(
        () =>
            getTableRange({
                range,
                customRange,
                timezone,
            }),
        [customRange, range, timezone]
    );
    const filters = useMemo(
        () => ({
            search: deferredSearchInput.trim() ? deferredSearchInput.trim() : undefined,
            state: statusFilter !== 'all' ? statusFilter : undefined,
            adProduct: adProductFilter !== 'all' ? adProductFilter : undefined,
        }),
        [statusFilter, adProductFilter, deferredSearchInput]
    );

    const { data, isLoading, isFetching } = usePerformanceTable({
        accountId,
        range: tableRange,
        dimension,
        filters,
    });

    const rows = data?.rows ?? [];
    const showSkeleton = isLoading || forceSkeleton;
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
            {isFetching && !isLoading ? <div className="mb-2 text-right text-muted-foreground text-xs">Refreshing…</div> : null}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input
                    aria-label={`Search ${getPrimaryColumnLabel(dimension)}`}
                    className="w-[220px] text-sm"
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder={`Search ${getPrimaryColumnLabel(dimension)}`}
                    type="search"
                    value={searchInput}
                />
                <Select aria-label="Select dimension" onValueChange={value => value && setDimension(value as PerformanceDimension)} value={dimension}>
                    <SelectTrigger className="w-[150px] text-sm">
                        <SelectValue>{value => DIMENSION_OPTIONS.find(option => option.value === value)?.label ?? 'Dimension'}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                        {DIMENSION_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectPopup>
                </Select>
                <Select aria-label="Select status" onValueChange={value => value && setStatusFilter(value)} value={statusFilter}>
                    <SelectTrigger className="w-[140px] text-sm">
                        <SelectValue>{value => STATUS_OPTIONS.find(option => option.value === value)?.label ?? 'Status'}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                        {STATUS_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectPopup>
                </Select>
                <Select aria-label="Select ad product" onValueChange={value => value && setAdProductFilter(value)} value={adProductFilter}>
                    <SelectTrigger className="w-[180px] text-sm">
                        <SelectValue>{value => AD_PRODUCT_OPTIONS.find(option => option.value === value)?.label ?? 'Ad product'}</SelectValue>
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
                        {METRIC_COLUMNS.map(column => (
                            <col className={column.width} key={column.id} />
                        ))}
                    </colgroup>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{getPrimaryColumnLabel(dimension)}</TableHead>
                            <TableHead className="w-[80px] max-w-[80px]">Status</TableHead>
                            <TableHead className="text-right">Spend</TableHead>
                            <TableHead className="text-right">Sales</TableHead>
                            <TableHead className="text-right">Purchases</TableHead>
                            <TableHead className="text-right">ACOS</TableHead>
                            <TableHead className="text-right">ROAS</TableHead>
                            <TableHead className="text-right">Details</TableHead>
                        </TableRow>
                    </TableHeader>
                </Table>
                <div className="relative rounded-xl border border-border bg-background bg-clip-padding shadow-xs before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:bg-clip-border dark:before:shadow-[0_-1px_--theme(--color-white/8%)]">
                    <ScrollArea allowScrollChaining className="h-[520px] max-h-[520px] [&_[data-slot=scroll-area-scrollbar]]:hidden" scrollFade>
                        <Table className="table-fixed">
                            <colgroup>
                                <col />
                                {METRIC_COLUMNS.map(column => (
                                    <col className={column.width} key={column.id} />
                                ))}
                            </colgroup>
                            <TableBody className="before:hidden">
                                {showSkeleton ? (
                                    <TableRow className="h-[520px] border-0">
                                        <TableCell className="h-[520px] border-0 p-0 align-top" colSpan={8}>
                                            <div className="box-border grid h-full grid-rows-[repeat(12,minmax(0,1fr))] gap-0">
                                                {TABLE_SKELETON_ROW_IDS.map(rowId => (
                                                    <div className="grid grid-cols-[minmax(0,1fr)_80px_110px_110px_110px_110px_110px_90px] items-center" key={rowId}>
                                                        <div className="px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                        <div className="px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                        <div className="flex justify-end px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                        <div className="flex justify-end px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                        <div className="flex justify-end px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                        <div className="flex justify-end px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                        <div className="flex justify-end px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                        <div className="flex justify-end px-2">
                                                            <Skeleton className="h-4 w-full" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : isEmpty ? (
                                    <TableRow>
                                        <TableCell className="py-10 text-center text-muted-foreground text-sm" colSpan={8}>
                                            No campaign performance data found for this range.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map(row => {
                                        if (row.dimension !== dimension) {
                                            return null;
                                        }

                                        const filter = getEntityFilterForRow(row);

                                        return (
                                            <TableRow key={getRowKey(row)}>
                                                <TableCell className="font-medium">
                                                    {filter ? (
                                                        <button
                                                            aria-label={`Filter chart by ${filter.label}`}
                                                            className="group flex w-full min-w-0 cursor-pointer flex-col text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                                            onClick={() => addEntityFilter(filter)}
                                                            type="button"
                                                        >
                                                            {renderPrimaryCell(row)}
                                                        </button>
                                                    ) : (
                                                        <div className="w-full min-w-0">{renderPrimaryCell(row)}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="w-[80px] max-w-[80px]">{renderStatus(row.state)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(row.metrics.spend)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(row.metrics.sales)}</TableCell>
                                                <TableCell className="text-right">{formatNumber(row.metrics.purchases)}</TableCell>
                                                <TableCell className="text-right">{formatPercent(row.metrics.acos)}</TableCell>
                                                <TableCell className="text-right">{formatRatio(row.metrics.roas)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button onClick={() => setDetailsRow(row)} size="xs" variant="outline">
                                                        Details
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </div>
                {rows.length > 0 ? (
                    <FrameFooter className="px-3 py-2 text-muted-foreground text-xs">
                        Showing {rows.length} {getFooterLabel(dimension)} by spend
                    </FrameFooter>
                ) : null}
            </Frame>
            <EntityDetailsDialog
                accountId={accountId}
                onOpenChange={open => {
                    if (!open) {
                        setDetailsRow(null);
                    }
                }}
                open={Boolean(detailsRow)}
                row={detailsRow}
            />
        </div>
    );
};

const renderStatus = (state: string) => {
    const normalized = state.toLowerCase();
    const dotClass = normalized === 'enabled' ? 'bg-emerald-500' : normalized === 'paused' ? 'bg-amber-500' : normalized === 'archived' ? 'bg-muted-foreground/50' : 'bg-slate-400';

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
        style: 'currency',
        currency: 'USD',
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

const truncateEnd = (value: string, maxLength = 48) => {
    if (value.length <= maxLength) {
        return value;
    }
    const visibleLength = Math.max(maxLength - 3, 0);
    return `${value.slice(0, visibleLength)}...`;
};

const formatSecondaryText = (value?: string | null) => {
    if (!value) {
        return null;
    }
    return truncateEnd(value);
};

const formatBreadcrumb = (campaignName?: string | null, adGroupName?: string | null, maxLength = 48) => {
    const campaign = campaignName?.trim();
    const adGroup = adGroupName?.trim();

    if (!(campaign || adGroup)) {
        return null;
    }
    if (!campaign) {
        return truncateEnd(adGroup ?? '', maxLength);
    }
    if (!adGroup) {
        return truncateEnd(campaign, maxLength);
    }

    const separator = ' / ';
    if (adGroup.length + separator.length >= maxLength) {
        return truncateEnd(adGroup, maxLength);
    }

    const availableForCampaign = maxLength - adGroup.length - separator.length;
    const campaignText = truncateEnd(campaign, availableForCampaign);
    return `${campaignText}${separator}${adGroup}`;
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
    if (row.dimension === 'campaign') {
        return String(row.campaignId);
    }
    if (row.dimension === 'adGroup') {
        return String(row.adGroupId);
    }
    if (row.dimension === 'ad') {
        return String(row.adId);
    }
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
        default:
            return null;
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
    campaignName?: string | null;
    adGroupName?: string | null;
}) => {
    if (row.dimension === 'campaign') {
        return (
            <div className="flex min-w-0 flex-col">
                <span className="truncate">{row.name ?? row.campaignId}</span>
            </div>
        );
    }

    if (row.dimension === 'adGroup') {
        const secondaryText = formatSecondaryText(row.campaignName);
        return (
            <div className="flex min-w-0 flex-col">
                <span className="truncate">{row.name ?? row.adGroupId}</span>
                {secondaryText ? <span className="truncate text-muted-foreground text-xs tracking-tight">{secondaryText}</span> : null}
            </div>
        );
    }

    if (row.dimension === 'ad') {
        const secondaryText = formatBreadcrumb(row.campaignName, row.adGroupName);
        return (
            <div className="flex min-w-0 flex-col">
                <span className="truncate">{row.productAsin ?? row.adId}</span>
                {secondaryText ? <span className="truncate text-muted-foreground text-xs tracking-tight">{secondaryText}</span> : null}
            </div>
        );
    }

    const secondaryText = formatBreadcrumb(row.campaignName, row.adGroupName);
    return (
        <div className="flex min-w-0 flex-col">
            <span className="truncate">{row.targetDisplay ?? row.targetId}</span>
            {secondaryText ? <span className="truncate text-muted-foreground text-xs tracking-tight">{secondaryText}</span> : null}
        </div>
    );
};

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

// Keyed by column identity, not by width: five of these columns share
// `w-[110px]`, so using the class as the React key collides.
const METRIC_COLUMNS = [
    { id: 'status', width: 'w-[80px]' },
    { id: 'spend', width: 'w-[110px]' },
    { id: 'sales', width: 'w-[110px]' },
    { id: 'purchases', width: 'w-[110px]' },
    { id: 'acos', width: 'w-[110px]' },
    { id: 'roas', width: 'w-[110px]' },
    { id: 'details', width: 'w-[90px]' },
] as const;

export { PerformanceTable };

const ALL_TIME_FALLBACK_START = new Date(Date.UTC(2000, 0, 1));

const getTableRange = ({ range, customRange, timezone }: { range: PerformanceRange; customRange: { start: string; end: string } | null; timezone: string }) => {
    const hasCustomRange = Boolean(customRange?.start && customRange?.end);
    const rangeResult = getPerformanceRange({
        range,
        timezone,
        customRange: hasCustomRange ? customRange : null,
        allTimeStartUtc: range === 'all_time' ? ALL_TIME_FALLBACK_START : null,
    });

    return {
        startDate: formatInTimeZone(rangeResult.rangeStartZoned, timezone, 'MM-dd-yyyy'),
        endDate: formatInTimeZone(rangeResult.rangeEndZoned, timezone, 'MM-dd-yyyy'),
    };
};

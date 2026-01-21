import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/dashboard/components/ui/badge';
import { Button } from '@/dashboard/components/ui/button';
import { ButtonGroup } from '@/dashboard/components/ui/button-group';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/dashboard/components/ui/dialog';
import { Field, FieldLabel } from '@/dashboard/components/ui/field';
import { Input } from '@/dashboard/components/ui/input';
import { Separator } from '@/dashboard/components/ui/separator';
import { Spinner } from '@/dashboard/components/ui/spinner';
import { api } from '@/dashboard/lib/trpc';
import { useAdsEntityDetails } from '@/dashboard/routes/hooks/use-ads-entity-details';
import type { PerformanceDimension, PerformanceTableOutput } from '@/types/performance-api';

const PAGE_SIZE = 10;

const EntityDetailsDialog = ({
    open,
    onOpenChange,
    row,
    accountId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    row: PerformanceTableRow | null;
    accountId: string;
}) => {
    const [selectedEntity, setSelectedEntity] = useState<DetailsEntity | null>(row ? toDetailsEntity(row) : null);
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
    const [bidDraft, setBidDraft] = useState('');
    const [bidDirty, setBidDirty] = useState(false);
    const [adGroupOffset, setAdGroupOffset] = useState(0);
    const [adsOffset, setAdsOffset] = useState(0);
    const [targetsOffset, setTargetsOffset] = useState(0);

    useEffect(() => {
        if (!open) {
            setSelectedEntity(null);
            setBidDraft('');
            setBidDirty(false);
            setAdGroupOffset(0);
            setAdsOffset(0);
            setTargetsOffset(0);
            setBreadcrumbs([]);
            return;
        }

        if (!row) {
            setSelectedEntity(null);
            setBreadcrumbs([]);
            return;
        }

        const entity = toDetailsEntity(row);
        setSelectedEntity(entity);
        setBidDirty(false);
        setAdGroupOffset(0);
        setAdsOffset(0);
        setTargetsOffset(0);
        setBreadcrumbs([
            {
                label: getBreadcrumbLabel(row),
                entity,
            },
        ]);
    }, [open, row]);

    useEffect(() => {
        if (!selectedEntity) return;
        setBidDirty(false);
        setBidDraft('');
        if (selectedEntity.dimension === 'campaign') {
            setAdGroupOffset(0);
            setAdsOffset(0);
            setTargetsOffset(0);
        }
        if (selectedEntity.dimension === 'adGroup') {
            setAdsOffset(0);
            setTargetsOffset(0);
        }
    }, [selectedEntity]);

    const entityType = selectedEntity?.dimension ?? 'campaign';
    const entityId = getEntityId(selectedEntity);

    const { data, isLoading, error } = useAdsEntityDetails({
        accountId,
        entityType,
        entityId,
        enabled: open && Boolean(selectedEntity && entityId),
    });

    const utils = api.useUtils();
    const updateBid = api.ads.targets.updateBid.useMutation({
        onSuccess: result => {
            utils.ads.targets.get.setData({ accountId, targetId: result.targetId }, prev =>
                prev ? { ...prev, bidAmount: result.bidAmount, lastUpdatedDateTime: result.lastUpdatedDateTime } : prev
            );
            utils.ads.targets.list.invalidate();
            toast.success('Bid updated', {
                description: `New bid: ${formatCurrency(result.bidAmount)}`,
            });
        },
        onError: err => {
            toast.error('Bid update failed', {
                description: err.message,
            });
        },
    });

    const targetData = data && 'targetId' in data ? data : null;

    useEffect(() => {
        if (!open) return;
        if (!targetData) return;
        if (bidDirty) return;

        setBidDraft(targetData.bidAmount !== null ? targetData.bidAmount.toFixed(2) : '');
    }, [open, targetData, bidDirty]);

    const bidValue = Number(bidDraft);
    const bidInvalid = !Number.isFinite(bidValue) || bidValue <= 0;
    const hasBid = targetData?.bidAmount !== null && targetData?.bidAmount !== undefined;
    const bidChanged = hasBid ? Number(targetData?.bidAmount) !== Number(bidValue.toFixed(2)) : Boolean(bidDraft);

    const canEditBid = Boolean(
        targetData &&
            !targetData.negative &&
            targetData.adGroupId &&
            isSponsoredProducts(targetData.adProduct)
    );

    const bidHelper = getBidHelper(targetData);

    const campaignIdForRelated = entityType === 'campaign' ? entityId : null;
    const adGroupIdForRelated = entityType === 'adGroup' ? entityId : null;

    const adGroupFilters = campaignIdForRelated ? { campaignId: campaignIdForRelated } : undefined;
    const adGroupsQuery = api.ads.adGroups.list.useQuery(
        {
            accountId,
            pagination: { limit: PAGE_SIZE, cursor: adGroupOffset ? String(adGroupOffset) : undefined },
            filters: adGroupFilters,
            sort: { field: 'name', direction: 'asc' },
        },
        {
            enabled: Boolean(open && campaignIdForRelated),
        }
    );

    const adsFilters = adGroupIdForRelated ? { adGroupId: adGroupIdForRelated } : undefined;
    const adsQuery = api.ads.ads.list.useQuery(
        {
            accountId,
            pagination: { limit: PAGE_SIZE, cursor: adsOffset ? String(adsOffset) : undefined },
            filters: adsFilters,
            sort: { field: 'adId', direction: 'asc' },
        },
        {
            enabled: Boolean(open && adGroupIdForRelated),
        }
    );

    const targetsFilters = adGroupIdForRelated ? { adGroupId: adGroupIdForRelated } : undefined;
    const targetsQuery = api.ads.targets.list.useQuery(
        {
            accountId,
            pagination: { limit: PAGE_SIZE, cursor: targetsOffset ? String(targetsOffset) : undefined },
            filters: targetsFilters,
            sort: { field: 'targetType', direction: 'asc' },
        },
        {
            enabled: Boolean(open && adGroupIdForRelated),
        }
    );

    const adGroupPage = Math.floor(adGroupOffset / PAGE_SIZE) + 1;
    const adsPage = Math.floor(adsOffset / PAGE_SIZE) + 1;
    const targetsPage = Math.floor(targetsOffset / PAGE_SIZE) + 1;

    const handleNavigate = useCallback((entity: DetailsEntity, label: string) => {
        setSelectedEntity(entity);
        setBreadcrumbs(prev => {
            const existingIndex = prev.findIndex(crumb => isSameEntity(crumb.entity, entity));
            if (existingIndex >= 0) {
                return prev.slice(0, existingIndex + 1);
            }
            return [...prev, { label, entity }];
        });
    }, []);

    const details = useMemo(() => {
        if (!data) return null;

        if ('campaignId' in data && 'targetingSettings' in data) {
            return {
                title: 'Campaign details',
                subtitle: data.campaignId,
                rows: [
                    { label: 'Name', value: data.name },
                    { label: 'State', value: <StatusBadge state={data.state} /> },
                    { label: 'Ad product', value: data.adProduct },
                    { label: 'Delivery status', value: data.deliveryStatus },
                    { label: 'Targeting', value: data.targetingSettings },
                    { label: 'Bid strategy', value: data.bidStrategy ?? '—' },
                    { label: 'Budget', value: formatBudget(data.budgetAmount, data.budgetType, data.budgetPeriod) },
                    { label: 'Start date', value: data.startDate },
                    { label: 'End date', value: data.endDate ?? '—' },
                    { label: 'Created', value: formatDateTime(data.creationDateTime) },
                    { label: 'Updated', value: formatDateTime(data.lastUpdatedDateTime) },
                ],
            };
        }

        if ('adGroupId' in data && 'bidAmount' in data) {
            return {
                title: 'Ad group details',
                subtitle: data.adGroupId,
                rows: [
                    { label: 'Name', value: data.name },
                    { label: 'State', value: <StatusBadge state={data.state} /> },
                    {
                        label: 'Campaign',
                        value: (
                            <InlineEntityLink
                                label={data.campaignId}
                                onClick={() =>
                                    handleNavigate(
                                        {
                                            dimension: 'campaign',
                                            campaignId: data.campaignId,
                                        },
                                        data.campaignId
                                    )
                                }
                            />
                        ),
                    },
                    { label: 'Ad product', value: data.adProduct },
                    { label: 'Delivery status', value: data.deliveryStatus },
                    { label: 'Default bid', value: data.bidAmount !== null ? formatCurrency(data.bidAmount) : '—' },
                    { label: 'Created', value: formatDateTime(data.creationDateTime) },
                    { label: 'Updated', value: formatDateTime(data.lastUpdatedDateTime) },
                ],
            };
        }

        if ('adId' in data && 'adType' in data) {
            return {
                title: 'Ad details',
                subtitle: data.adId,
                rows: [
                    { label: 'ASIN', value: data.productAsin ?? '—' },
                    { label: 'State', value: <StatusBadge state={data.state} /> },
                    {
                        label: 'Campaign',
                        value: (
                            <InlineEntityLink
                                label={data.campaignId}
                                onClick={() =>
                                    handleNavigate(
                                        {
                                            dimension: 'campaign',
                                            campaignId: data.campaignId,
                                        },
                                        data.campaignId
                                    )
                                }
                            />
                        ),
                    },
                    {
                        label: 'Ad group',
                        value: (
                            <InlineEntityLink
                                label={data.adGroupId}
                                onClick={() =>
                                    handleNavigate(
                                        {
                                            dimension: 'adGroup',
                                            adGroupId: data.adGroupId,
                                            campaignId: data.campaignId,
                                        },
                                        data.adGroupId
                                    )
                                }
                            />
                        ),
                    },
                    { label: 'Ad product', value: data.adProduct },
                    { label: 'Ad type', value: data.adType },
                    { label: 'Delivery status', value: data.deliveryStatus },
                    { label: 'Created', value: formatDateTime(data.creationDateTime) },
                    { label: 'Updated', value: formatDateTime(data.lastUpdatedDateTime) },
                ],
            };
        }

        if ('targetId' in data && 'targetType' in data) {
            return {
                title: 'Target details',
                subtitle: data.targetId,
                rows: [
                    { label: 'Target', value: data.targetDisplay },
                    { label: 'State', value: <StatusBadge state={data.state} /> },
                    {
                        label: 'Campaign',
                        value: (
                            <InlineEntityLink
                                label={data.campaignId}
                                onClick={() =>
                                    handleNavigate(
                                        {
                                            dimension: 'campaign',
                                            campaignId: data.campaignId,
                                        },
                                        data.campaignId
                                    )
                                }
                            />
                        ),
                    },
                    {
                        label: 'Ad group',
                        value: data.adGroupId ? (
                            <InlineEntityLink
                                label={data.adGroupId}
                                onClick={() =>
                                    handleNavigate(
                                        {
                                            dimension: 'adGroup',
                                            adGroupId: data.adGroupId,
                                            campaignId: data.campaignId,
                                        },
                                        data.adGroupId
                                    )
                                }
                            />
                        ) : (
                            '—'
                        ),
                    },
                    { label: 'Ad product', value: data.adProduct },
                    { label: 'Target type', value: data.targetType },
                    { label: 'Match type', value: data.targetMatchType ?? '—' },
                    { label: 'Negative', value: data.negative ? 'Yes' : 'No' },
                    { label: 'Bid', value: data.bidAmount !== null ? formatCurrency(data.bidAmount) : '—' },
                    { label: 'Created', value: formatDateTime(data.creationDateTime) },
                    { label: 'Updated', value: formatDateTime(data.lastUpdatedDateTime) },
                ],
            };
        }

        return null;
    }, [data, handleNavigate]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogPopup className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{details?.title ?? 'Details'}</DialogTitle>
                    <DialogDescription>{details?.subtitle ? `ID · ${details.subtitle}` : 'Entity details'}</DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    {breadcrumbs.length > 1 ? (
                        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {breadcrumbs.map((crumb, index) => (
                                <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                                    {index < breadcrumbs.length - 1 ? (
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => {
                                                setSelectedEntity(crumb.entity);
                                                setBreadcrumbs(breadcrumbs.slice(0, index + 1));
                                            }}
                                        >
                                            {crumb.label}
                                        </Button>
                                    ) : (
                                        <span className="text-xs font-semibold text-foreground">{crumb.label}</span>
                                    )}
                                    {index < breadcrumbs.length - 1 ? <span className="text-muted-foreground">/</span> : null}
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Spinner />
                            Loading details…
                        </div>
                    ) : error ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-foreground">
                            {error.message}
                        </div>
                    ) : details ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {details.rows.map(rowItem => (
                                    <DetailRow key={rowItem.label} label={rowItem.label} value={rowItem.value} />
                                ))}
                            </div>
                            {entityType === 'campaign' ? (
                                <RelatedList
                                    title="Ad groups"
                                    items={adGroupsQuery.data?.rows ?? []}
                                    isLoading={adGroupsQuery.isLoading}
                                    emptyLabel="No ad groups found for this campaign."
                                    page={adGroupPage}
                                    hasPrevious={adGroupOffset > 0}
                                    hasNext={Boolean(adGroupsQuery.data?.nextCursor)}
                                    onPrevious={() => setAdGroupOffset(Math.max(0, adGroupOffset - PAGE_SIZE))}
                                    onNext={() => {
                                        const nextCursor = adGroupsQuery.data?.nextCursor;
                                        if (nextCursor) setAdGroupOffset(Number(nextCursor));
                                    }}
                                    onSelect={item =>
                                        handleNavigate(
                                            {
                                                dimension: 'adGroup',
                                                adGroupId: item.adGroupId,
                                                campaignId: item.campaignId,
                                            },
                                            item.name
                                        )
                                    }
                                    getKey={item => item.adGroupId}
                                    getPrimaryLabel={item => item.name}
                                    getSecondaryLabel={item => item.adGroupId}
                                    getState={item => item.state}
                                />
                            ) : null}
                            {entityType === 'adGroup' ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <RelatedList
                                        title="Ads"
                                        items={adsQuery.data?.rows ?? []}
                                        isLoading={adsQuery.isLoading}
                                        emptyLabel="No ads found for this ad group."
                                        page={adsPage}
                                        hasPrevious={adsOffset > 0}
                                        hasNext={Boolean(adsQuery.data?.nextCursor)}
                                        onPrevious={() => setAdsOffset(Math.max(0, adsOffset - PAGE_SIZE))}
                                        onNext={() => {
                                            const nextCursor = adsQuery.data?.nextCursor;
                                            if (nextCursor) setAdsOffset(Number(nextCursor));
                                        }}
                                        onSelect={item =>
                                            handleNavigate(
                                                {
                                                    dimension: 'ad',
                                                    adId: item.adId,
                                                    adGroupId: item.adGroupId,
                                                    campaignId: item.campaignId,
                                                },
                                                item.productAsin ?? item.adId
                                            )
                                        }
                                        getKey={item => item.adId}
                                        getPrimaryLabel={item => item.productAsin ?? item.adId}
                                        getSecondaryLabel={item => item.adId}
                                        getState={item => item.state}
                                    />
                                    <RelatedList
                                        title="Targets"
                                        items={targetsQuery.data?.rows ?? []}
                                        isLoading={targetsQuery.isLoading}
                                        emptyLabel="No targets found for this ad group."
                                        page={targetsPage}
                                        hasPrevious={targetsOffset > 0}
                                        hasNext={Boolean(targetsQuery.data?.nextCursor)}
                                        onPrevious={() => setTargetsOffset(Math.max(0, targetsOffset - PAGE_SIZE))}
                                        onNext={() => {
                                            const nextCursor = targetsQuery.data?.nextCursor;
                                            if (nextCursor) setTargetsOffset(Number(nextCursor));
                                        }}
                                        onSelect={item =>
                                            handleNavigate(
                                                {
                                                    dimension: 'target',
                                                    targetId: item.targetId,
                                                    adGroupId: item.adGroupId ?? undefined,
                                                    campaignId: item.campaignId,
                                                },
                                                item.targetDisplay
                                            )
                                        }
                                        getKey={item => item.targetId}
                                        getPrimaryLabel={item => item.targetDisplay}
                                        getSecondaryLabel={item => item.targetType}
                                        getState={item => item.state}
                                    />
                                </div>
                            ) : null}
                            {targetData ? (
                                <>
                                    <Separator />
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-semibold">Adjust bid</p>
                                                <p className="text-xs text-muted-foreground">Sponsored Products targets only</p>
                                            </div>
                                            {targetData.negative ? <Badge variant="outline">Negative target</Badge> : null}
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                                            <Field>
                                                <FieldLabel>New bid</FieldLabel>
                                                <Input
                                                    size="sm"
                                                    type="number"
                                                    inputMode="decimal"
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={bidDraft}
                                                    onChange={event => {
                                                        setBidDraft(event.target.value);
                                                        setBidDirty(true);
                                                    }}
                                                    disabled={!canEditBid}
                                                />
                                                {bidHelper ? <p className="text-xs text-muted-foreground">{bidHelper}</p> : null}
                                            </Field>
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    if (!targetData) return;
                                                    updateBid.mutate({
                                                        accountId,
                                                        targetId: targetData.targetId,
                                                        bidAmount: bidValue,
                                                    });
                                                }}
                                                disabled={!canEditBid || bidInvalid || !bidChanged || updateBid.isLoading}
                                            >
                                                {updateBid.isLoading ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <Spinner className="size-3" />
                                                        Updating…
                                                    </span>
                                                ) : (
                                                    'Update bid'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">Select a row to view details.</div>
                    )}
                </DialogPanel>
                <DialogFooter variant="bare">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
};

const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
);

const InlineEntityLink = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{label}</span>
        <Button size="xs" variant="ghost" onClick={onClick} className="h-6 px-2 text-xs">
            View
        </Button>
    </div>
);

const RelatedList = <Item,>({
    title,
    items,
    isLoading,
    emptyLabel,
    page,
    hasPrevious,
    hasNext,
    onPrevious,
    onNext,
    onSelect,
    getKey,
    getPrimaryLabel,
    getSecondaryLabel,
    getState,
}: {
    title: string;
    items: Item[];
    isLoading: boolean;
    emptyLabel: string;
    page: number;
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onSelect: (item: Item) => void;
    getKey?: (item: Item) => string;
    getPrimaryLabel: (item: Item) => string;
    getSecondaryLabel: (item: Item) => string;
    getState: (item: Item) => string;
}) => {
    return (
        <div className="rounded-xl border border-border/60 bg-muted/10">
            <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
                <Badge variant="outline">{items.length}</Badge>
            </div>
            <div className="divide-y divide-border/60">
                {isLoading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                        <Spinner className="size-3" />
                        Loading {title.toLowerCase()}…
                    </div>
                ) : items.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">{emptyLabel}</div>
                ) : (
                    items.map(item => (
                        <div key={(getKey ? getKey(item) : `${getPrimaryLabel(item)}-${getSecondaryLabel(item)}`)} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{getPrimaryLabel(item)}</p>
                                <p className="truncate text-xs text-muted-foreground">{getSecondaryLabel(item)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <StatusBadge state={getState(item)} />
                                <Button size="xs" variant="outline" onClick={() => onSelect(item)}>
                                    Details
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="flex items-center justify-between border-t border-border/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">Page {page}</span>
                <ButtonGroup>
                    <Button size="xs" variant="ghost" onClick={onPrevious} disabled={!hasPrevious}>
                        Prev
                    </Button>
                    <Button size="xs" variant="ghost" onClick={onNext} disabled={!hasNext}>
                        Next
                    </Button>
                </ButtonGroup>
            </div>
        </div>
    );
};

const StatusBadge = ({ state }: { state: string }) => {
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

const getEntityId = (row: DetailsEntity | null) => {
    if (!row) return '';
    if (row.dimension === 'campaign') return String(row.campaignId ?? '');
    if (row.dimension === 'adGroup') return String(row.adGroupId ?? '');
    if (row.dimension === 'ad') return String(row.adId ?? '');
    return String(row.targetId ?? '');
};

const toDetailsEntity = (row: PerformanceTableRow): DetailsEntity => {
    if (row.dimension === 'campaign') {
        return { dimension: 'campaign', campaignId: row.campaignId };
    }

    if (row.dimension === 'adGroup') {
        return { dimension: 'adGroup', adGroupId: row.adGroupId, campaignId: row.campaignId };
    }

    if (row.dimension === 'ad') {
        return { dimension: 'ad', adId: row.adId, adGroupId: row.adGroupId, campaignId: row.campaignId };
    }

    return { dimension: 'target', targetId: row.targetId, adGroupId: row.adGroupId ?? undefined, campaignId: row.campaignId };
};

const getBreadcrumbLabel = (row: PerformanceTableRow) => {
    if (row.dimension === 'campaign') return row.name ?? row.campaignId;
    if (row.dimension === 'adGroup') return row.name ?? row.adGroupId;
    if (row.dimension === 'ad') return row.productAsin ?? row.adId;
    return row.targetDisplay ?? row.targetId;
};

const isSameEntity = (a: DetailsEntity, b: DetailsEntity) => {
    if (a.dimension !== b.dimension) return false;
    if (a.dimension === 'campaign') return a.campaignId === b.campaignId;
    if (a.dimension === 'adGroup') return a.adGroupId === b.adGroupId;
    if (a.dimension === 'ad') return a.adId === b.adId;
    return a.targetId === b.targetId;
};

const isSponsoredProducts = (adProduct: string) => {
    const normalized = adProduct.toUpperCase();
    return normalized === 'SPONSORED_PRODUCTS' || normalized === 'SP';
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
};

const formatDateTime = (value: string) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatBudget = (amount: number | null, type: string | null, period: string | null) => {
    if (amount === null) return '—';
    const budget = formatCurrency(amount);
    const suffix = [type, period].filter(Boolean).join(' · ');
    return suffix ? `${budget} · ${suffix}` : budget;
};

const getBidHelper = (targetData: TargetDetails | null) => {
    if (!targetData) return null;
    if (targetData.negative) return 'Negative targets cannot be edited.';
    if (!targetData.adGroupId) return 'Campaign-level targets do not support bids.';
    if (!isSponsoredProducts(targetData.adProduct)) return 'Only Sponsored Products bids are editable.';
    return null;
};

type PerformanceTableRow = PerformanceTableOutput['rows'][number];

type DetailsEntity = {
    dimension: PerformanceDimension;
    campaignId?: string;
    adGroupId?: string;
    adId?: string;
    targetId?: string;
};

type Breadcrumb = {
    label: string;
    entity: DetailsEntity;
};

type AdsDetailsData = ReturnType<typeof useAdsEntityDetails>['data'];
type TargetDetails = Extract<NonNullable<AdsDetailsData>, { targetId: string }>;

export { EntityDetailsDialog };

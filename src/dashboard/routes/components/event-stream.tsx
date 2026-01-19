import { formatInTimeZone } from 'date-fns-tz';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { AlertTriangle, Eye, EyeOff, Filter, RefreshCw } from 'lucide-react';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Combobox, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPopup } from '../../components/ui/combobox';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { Tooltip, TooltipCreateHandle, TooltipPopup, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import { useEvents } from '../hooks/use-events';
import { selectedAccountIdAtom, selectedCountryCodeAtom } from './account-selector/atoms';

type EventRow = RouterOutputs['metrics']['events']['events'][number];

type EventBucket = {
    interval: string;
    count: number;
};

type EventRowWithMeta = {
    event: EventRow;
    formattedTime: string;
};

const OUTCOME_COPY: Record<string, { label: string; variant: 'success' | 'error' }> = {
    ok: { label: 'ok', variant: 'success' },
    error: { label: 'error', variant: 'error' },
};

const HEADER_COLUMNS = ['Time', 'Job', 'Outcome', 'Message'];
const histogramTooltipHandle = TooltipCreateHandle<ComponentType>();

export const EventStream = () => {
    const accountId = useAtomValue(selectedAccountIdAtom);
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    const hasSelection = Boolean(accountId && countryCode);

    const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
    const [jobNameInput, setJobNameInput] = useState('');
    const [appliedJobName, setAppliedJobName] = useState<string | null>(null);
    const [showEmptyMessages, setShowEmptyMessages] = useState(false);

    const baseRange = useMemo(() => {
        const to = roundUpToNearestFiveMinutes(new Date());
        const from = new Date(to.getTime() - 12 * 60 * 60 * 1000);
        return { from, to };
    }, []);

    const filterRange = useMemo(() => {
        if (!selectedBucket) {
            return null;
        }
        const start = new Date(selectedBucket);
        const end = new Date(start.getTime() + 5 * 60 * 1000);
        return { from: start, to: end };
    }, [selectedBucket]);

    const { data, isLoading, isFetching, error, refetch } = useEvents({
        accountId: accountId ?? '',
        countryCode: countryCode ?? '',
        from: baseRange.from.toISOString(),
        to: baseRange.to.toISOString(),
        filterFrom: filterRange?.from.toISOString(),
        filterTo: filterRange?.to.toISOString(),
        limit: 200,
        jobName: appliedJobName ?? undefined,
        enabled: hasSelection,
        refetchInterval: hasSelection ? 60000 : false,
    });

    const timezone = data?.timezone ?? 'UTC';
    const histogram = (data?.histogram ?? []) as EventBucket[];

    const events = useMemo<EventRowWithMeta[]>(() => {
        if (!data?.events) {
            return [];
        }
        return data.events.map(event => ({
            event,
            formattedTime: formatInTimeZone(new Date(event.createdAt), timezone, 'MMM dd HH:mm:ss.SSS'),
        }));
    }, [data?.events, timezone]);

    const filteredEvents = useMemo(() => {
        if (showEmptyMessages) {
            return events;
        }
        return events.filter(row => hasRenderableMessage(row.event.message, row.event.badges));
    }, [events, showEmptyMessages]);

    const jobNameOptions = useMemo(() => {
        const names = new Set<string>();
        for (const row of events) {
            if (row.event.jobName) {
                names.add(row.event.jobName);
            }
        }
        return Array.from(names).sort();
    }, [events]);

    const filteredJobNameOptions = useMemo(() => {
        const query = jobNameInput.trim().toLowerCase();
        if (!query) {
            return jobNameOptions;
        }
        return jobNameOptions.filter(jobName => {
            const formatted = formatJobName(jobName).toLowerCase();
            return jobName.toLowerCase().includes(query) || formatted.includes(query);
        });
    }, [jobNameInput, jobNameOptions]);

    const maxCount = useMemo(() => {
        return histogram.reduce((max, bucket) => Math.max(max, bucket.count), 0);
    }, [histogram]);

    const totalCount = useMemo(() => {
        return histogram.reduce((sum, bucket) => sum + bucket.count, 0);
    }, [histogram]);

    const selectedLabel = selectedBucket ? formatInTimeZone(new Date(selectedBucket), timezone, 'MMM dd HH:mm') : null;
    const trimmedJobName = jobNameInput.trim();
    const hasActiveFilters = Boolean(selectedBucket || appliedJobName);
    const canApplyJobFilter = trimmedJobName !== (appliedJobName ?? '');
    const emptyStateCopy =
        !showEmptyMessages && events.length > 0
            ? 'No events with messages yet'
            : hasActiveFilters
              ? 'No events match the current filters'
              : 'No events recorded yet';

    const applyFilters = () => {
        if (!hasSelection) {
            return;
        }
        if (canApplyJobFilter) {
            const nextJobName = trimmedJobName.length > 0 ? trimmedJobName : null;
            setAppliedJobName(nextJobName);
            setJobNameInput(nextJobName ?? '');
            return;
        }
        if (hasActiveFilters) {
            setSelectedBucket(null);
            setAppliedJobName(null);
            setJobNameInput('');
        }
    };

    const handleBucketClick = (bucket: EventBucket) => {
        setSelectedBucket(current => (current === bucket.interval ? null : bucket.interval));
    };

    return (
        <>
            <Card className="font-mono pb-0 gap-0 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 mb-4 px-4">
                    <Button
                        variant="outline"
                        size="icon-lg"
                        onClick={applyFilters}
                        disabled={!hasSelection || (!hasActiveFilters && !canApplyJobFilter)}
                        title={canApplyJobFilter ? 'Apply filters' : hasActiveFilters ? 'Clear filters' : 'No filters'}
                    >
                        <Filter className="h-5 w-5" />
                    </Button>

                    <div className="flex-1 min-w-0">
                        <Combobox
                            value={appliedJobName ?? ''}
                            inputValue={jobNameInput}
                            onInputValueChange={value => {
                                setJobNameInput(value);
                                if (!value.trim()) {
                                    setAppliedJobName(null);
                                }
                            }}
                            onValueChange={value => {
                                const nextValue = value?.toString() ?? '';
                                setAppliedJobName(nextValue ? nextValue : null);
                                setJobNameInput(nextValue);
                            }}
                        >
                            <ComboboxInput
                                aria-label="Filter by job name"
                                placeholder="Filter by job name"
                                showClear
                                size="lg"
                                onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                        applyFilters();
                                    }
                                }}
                            />
                            <ComboboxPopup>
                                <ComboboxList>
                                    {filteredJobNameOptions.length === 0 ? (
                                        <ComboboxEmpty>No matching jobs</ComboboxEmpty>
                                    ) : (
                                        filteredJobNameOptions.map(jobName => (
                                            <ComboboxItem key={jobName} value={jobName}>
                                                {formatJobName(jobName)}
                                            </ComboboxItem>
                                        ))
                                    )}
                                </ComboboxList>
                            </ComboboxPopup>
                        </Combobox>
                    </div>

                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="outline"
                                    size="icon-lg"
                                    onClick={() => setShowEmptyMessages(current => !current)}
                                    aria-pressed={showEmptyMessages}
                                >
                                    {showEmptyMessages ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                </Button>
                            }
                            delay={0}
                            closeDelay={0}
                        />
                        <TooltipPopup>{showEmptyMessages ? 'Hide empty messages' : 'Show empty messages'}</TooltipPopup>
                    </Tooltip>

                    <Button
                        variant="outline"
                        size="icon-lg"
                        onClick={() => {
                            refetch();
                        }}
                        disabled={!hasSelection || isFetching}
                        title={isFetching ? 'Refreshing events' : 'Refresh events'}
                    >
                        {isFetching ? <Spinner className="size-4 text-muted-foreground" /> : <RefreshCw className="h-5 w-5" />}
                    </Button>
                </div>

                {!hasSelection ? (
                    <div className="flex items-center justify-center py-10">
                        <p className="text-sm text-muted-foreground">Select an account to view events</p>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground">Unable to load events</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">{error instanceof Error ? error.message : 'Please try again later'}</p>
                        </div>
                    </div>
                ) : isLoading && !data ? (
                    <div className="flex items-center justify-center py-10">
                        <Spinner className="size-5 text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs text-muted-foreground">
                            <span>{`${totalCount.toLocaleString()} events (last 12h)`}</span>
                            {appliedJobName && <span>{`• Job: ${formatJobName(appliedJobName)}`}</span>}
                            {selectedLabel && <span>{`• Window: ${selectedLabel}`}</span>}
                            {!showEmptyMessages && <span>• Hiding empty messages</span>}
                        </div>

                        <TooltipProvider>
                            <div className="h-20 flex items-end gap-px mb-4 px-4">
                                {histogram.map(bucket => {
                                    const height = maxCount > 0 ? Math.max(2, Math.round((bucket.count / maxCount) * 48)) : 2;
                                    const isSelected = selectedBucket === bucket.interval;
                                    const formattedBucket = formatInTimeZone(new Date(bucket.interval), timezone, 'MMM dd HH:mm');
                                    const rangeLabel = formatBucketRange(bucket.interval, timezone);
                                    const RangeContent = () => (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-foreground">{rangeLabel}</span>
                                            <span className="text-muted-foreground">
                                                {bucket.count.toLocaleString()} {bucket.count === 1 ? 'event' : 'events'}
                                            </span>
                                        </div>
                                    );

                                    return (
                                        <TooltipTrigger
                                            key={bucket.interval}
                                            className="group flex-1 min-w-[2px] h-full flex items-end"
                                            onClick={() => handleBucketClick(bucket)}
                                            aria-label={`Filter to ${formattedBucket}`}
                                            type="button"
                                            handle={histogramTooltipHandle}
                                            payload={RangeContent}
                                            delay={0}
                                        >
                                            <span
                                                className={cn(
                                                    'block w-full group-hover:bg-foreground/70',
                                                    bucket.count > 0 ? 'bg-muted-foreground/50' : 'bg-muted/70',
                                                    isSelected && 'bg-foreground'
                                                )}
                                                style={{ height }}
                                            />
                                        </TooltipTrigger>
                                    );
                                })}
                            </div>
                            <Tooltip handle={histogramTooltipHandle}>
                                {({ payload: Payload }) => (
                                    <TooltipPopup>{Payload ? <Payload /> : null}</TooltipPopup>
                                )}
                            </Tooltip>
                        </TooltipProvider>

                        <div className="grid grid-cols-[200px_160px_56px_1fr] gap-4 px-4 py-2 text-xs text-muted-foreground border-b border-border">
                            {HEADER_COLUMNS.map(column => (
                                <div key={column}>{column}</div>
                            ))}
                        </div>

                        {filteredEvents.length === 0 ? (
                            <div className="flex items-center justify-center py-8">
                                <p className="text-sm text-muted-foreground">{emptyStateCopy}</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/60">
                                {filteredEvents.map(row => {
                                    const isError = row.event.outcome === 'error';
                                    return (
                                        <div
                                            key={row.event.id}
                                            className={cn('grid grid-cols-[200px_160px_56px_1fr] gap-4 px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer min-w-0', isError && 'bg-destructive/10')}
                                            onClick={() => setSelectedEvent(row.event)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {isError && <AlertTriangle className="h-4 w-4 text-warning-foreground" />}
                                                <span className={cn(isError ? 'text-destructive-foreground' : 'text-foreground')}>{row.formattedTime}</span>
                                            </div>
                                            <div className="flex items-center gap-2 truncate">
                                                <span className="truncate" title={row.event.jobName}>
                                                    {formatJobName(row.event.jobName)}
                                                </span>
                                            </div>
                                            <div className={cn('font-mono text-xs', isError ? 'text-destructive-foreground' : 'text-success-foreground')}>
                                                {OUTCOME_COPY[row.event.outcome]?.label ?? row.event.outcome}
                                            </div>
                                            <div className="text-muted-foreground truncate whitespace-nowrap min-w-0">{renderMessage(row.event.message, row.event.badges)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </Card>

            <Dialog open={Boolean(selectedEvent)} onOpenChange={(open: boolean) => !open && setSelectedEvent(null)}>
                <DialogPopup className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Event details</DialogTitle>
                        <DialogDescription>Event payload</DialogDescription>
                    </DialogHeader>
                    {selectedEvent && (
                        <DialogPanel className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-mono text-muted-foreground">{selectedEvent.jobName}</span>
                                <span className="text-muted-foreground">{formatInTimeZone(new Date(selectedEvent.createdAt), timezone, 'MMM dd HH:mm:ss.SSS')}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <OutcomeBadge outcome={selectedEvent.outcome} />
                                {selectedEvent.badges?.map(badge => (
                                    <EventBadge key={badge} badge={badge} />
                                ))}
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-3">
                                <pre className="max-h-[50vh] overflow-auto text-xs font-mono text-muted-foreground">
                                    <code>{JSON.stringify(selectedEvent, null, 2)}</code>
                                </pre>
                            </div>
                        </DialogPanel>
                    )}
                    <DialogFooter>
                        <DialogClose>
                            <Button variant="outline">Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogPopup>
            </Dialog>
        </>
    );
};

const OutcomeBadge = ({ outcome }: { outcome: string }) => {
    const config = OUTCOME_COPY[outcome] ?? { label: outcome, variant: 'secondary' as const };
    return (
        <Badge variant={config.variant} className="text-[11px]">
            {config.label}
        </Badge>
    );
};

const EventBadge = ({ badge }: { badge: string }) => {
    return (
        <Badge variant={getBadgeVariant(badge)} className="text-[11px]">
            {badge}
        </Badge>
    );
};

const renderMessage = (message?: string | null, badges?: string[] | null): ReactNode => {
    if (!message) {
        if (!badges?.length) {
            return null;
        }
        return (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                {badges.map(badge => (
                    <EventBadge key={badge} badge={badge} />
                ))}
            </span>
        );
    }

    if (!message.includes('{{badges}}')) {
        return <span className="inline-flex items-center gap-1 whitespace-nowrap">{message}</span>;
    }

    const [before, after] = message.split('{{badges}}');

    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {before?.trim() && <span>{before.trimEnd()}</span>}
            {badges?.map(badge => (
                <EventBadge key={badge} badge={badge} />
            ))}
            {after?.trim() && <span>{after.trimStart()}</span>}
        </span>
    );
};

const getBadgeVariant = (badge: string) => {
    if (badge.includes('·') || badge.includes('hourly') || badge.includes('daily')) {
        return 'warning' as const;
    }
    return 'info' as const;
};

const hasRenderableMessage = (message?: string | null, badges?: string[] | null) => {
    if (message) {
        const trimmed = message.trim();
        if (!trimmed) {
            return Boolean(badges?.length);
        }
        if (!trimmed.includes('{{badges}}')) {
            return true;
        }
        const cleaned = trimmed.replace('{{badges}}', '').trim();
        return Boolean(cleaned) || Boolean(badges?.length);
    }
    return Boolean(badges?.length);
};

const formatBucketRange = (interval: string, timezone: string) => {
    const start = new Date(interval);
    const end = new Date(start.getTime() + 5 * 60 * 1000);
    const startDay = formatInTimeZone(start, timezone, 'MMM dd');
    const endDay = formatInTimeZone(end, timezone, 'MMM dd');

    if (startDay === endDay) {
        return `${formatInTimeZone(start, timezone, 'MMM dd HH:mm')} - ${formatInTimeZone(end, timezone, 'HH:mm')}`;
    }

    return `${formatInTimeZone(start, timezone, 'MMM dd HH:mm')} - ${formatInTimeZone(end, timezone, 'MMM dd HH:mm')}`;
};

const formatJobName = (jobName: string) => {
    return jobName.replace(/-/g, ' ');
};

const roundUpToNearestFiveMinutes = (date: Date): Date => {
    return new Date(Math.ceil(date.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
};

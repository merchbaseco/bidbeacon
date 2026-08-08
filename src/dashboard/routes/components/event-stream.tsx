import { HugeiconsIcon } from '@hugeicons/react';
import { CircleArrowDown02Icon, FilterResetIcon } from '@hugeicons-pro/core-solid-rounded';
import { formatInTimeZone } from 'date-fns-tz';
import { useAtomValue } from 'jotai';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Spinner } from '../../components/ui/spinner';
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import { useEvents } from '../hooks/use-events';
import { useWebSocketEvents } from '../hooks/use-websocket-events';
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
const ALL_EVENTS_VALUE = '__all__';
const HISTOGRAM_MAX_HEIGHT = 64;
export const EventStream = () => {
    const accountId = useAtomValue(selectedAccountIdAtom);
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    const hasSelection = Boolean(accountId && countryCode);

    const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
    const [appliedJobName, setAppliedJobName] = useState<string | null>(null);
    const [showEmptyMessages, setShowEmptyMessages] = useState(false);

    const [baseRange, setBaseRange] = useState(buildBaseRange);

    useWebSocketEvents('events:updated', event => {
        if (event.accountId === accountId) {
            setBaseRange(buildBaseRange());
        }
    });

    useEffect(() => {
        const interval = window.setInterval(() => setBaseRange(buildBaseRange()), 60_000);
        return () => window.clearInterval(interval);
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
        refetchInterval: hasSelection ? 60_000 : false,
    });

    const timezone = data?.timezone ?? 'UTC';
    const histogram = (data?.histogram ?? []) as EventBucket[];

    const events = useMemo<EventRowWithMeta[]>(() => {
        if (!data?.events) {
            return [];
        }
        return data.events.map(event => ({
            event,
            formattedTime: formatInTimeZone(new Date(event.createdAt), timezone, 'MMM dd HH:mm:ss'),
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

    const maxCount = useMemo(() => {
        return histogram.reduce((max, bucket) => Math.max(max, bucket.count), 0);
    }, [histogram]);

    const totalCount = useMemo(() => {
        return histogram.reduce((sum, bucket) => sum + bucket.count, 0);
    }, [histogram]);

    const selectedLabel = selectedBucket ? formatInTimeZone(new Date(selectedBucket), timezone, 'MMM dd HH:mm') : null;
    const hasActiveFilters = Boolean(selectedBucket || appliedJobName);
    const selectedJobLabel = appliedJobName ? formatJobName(appliedJobName) : 'All Events';
    const emptyStateCopy = !showEmptyMessages && events.length > 0 ? 'No events with messages yet' : hasActiveFilters ? 'No events match the current filters' : 'No events recorded yet';

    const clearFilters = () => {
        if (!hasSelection) {
            return;
        }
        setSelectedBucket(null);
        setAppliedJobName(null);
    };

    const handleBucketClick = (bucket: EventBucket) => {
        setSelectedBucket(current => (current === bucket.interval ? null : bucket.interval));
    };

    return (
        <>
            <Card className="gap-0 overflow-hidden pt-4 pb-0 font-mono">
                <div className="flex flex-wrap items-start justify-between gap-2 px-4">
                    <div className="-mt-1 flex flex-col gap-1">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="font-medium text-muted-foreground text-sm">Event Stream</span>
                            <Select
                                disabled={!hasSelection}
                                onValueChange={value => {
                                    if (value === ALL_EVENTS_VALUE) {
                                        setAppliedJobName(null);
                                        return;
                                    }
                                    setAppliedJobName(value);
                                }}
                                value={appliedJobName ?? ALL_EVENTS_VALUE}
                            >
                                <SelectTrigger className="h-auto w-auto min-w-0 justify-start gap-2 border-transparent bg-transparent px-0 py-0 text-foreground shadow-none before:hidden hover:bg-transparent focus-visible:ring-0 data-pressed:bg-transparent data-placeholder:text-muted-foreground sm:text-sm dark:bg-transparent dark:data-pressed:bg-transparent [&_[data-slot=select-icon]]:hidden">
                                    <span className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{selectedJobLabel}</span>
                                        <SelectValue className="sr-only" />
                                        <HugeiconsIcon className="size-5 shrink-0" icon={CircleArrowDown02Icon} />
                                    </span>
                                </SelectTrigger>
                                <SelectPopup>
                                    <SelectItem value={ALL_EVENTS_VALUE}>All Events</SelectItem>
                                    {jobNameOptions.length === 0 ? (
                                        <SelectItem disabled value="__empty__">
                                            No jobs yet
                                        </SelectItem>
                                    ) : (
                                        jobNameOptions.map(jobName => (
                                            <SelectItem key={jobName} value={jobName}>
                                                {formatJobName(jobName)}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectPopup>
                            </Select>

                            {hasActiveFilters && (
                                <Tooltip>
                                    <TooltipTrigger
                                        closeDelay={0}
                                        delay={0}
                                        render={
                                            <Button disabled={!hasSelection} onClick={clearFilters} size="icon" variant="ghost">
                                                <HugeiconsIcon className="size-5" icon={FilterResetIcon} />
                                            </Button>
                                        }
                                    />
                                    <TooltipPopup>Clear filters</TooltipPopup>
                                </Tooltip>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pb-3 text-muted-foreground text-xs">
                            <span>{`${totalCount.toLocaleString()} events (last 12h)`}</span>
                            {selectedLabel && <span>{`• Window: ${selectedLabel}`}</span>}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger
                                closeDelay={0}
                                delay={0}
                                render={
                                    <Button aria-pressed={showEmptyMessages} onClick={() => setShowEmptyMessages(current => !current)} size="icon-lg" variant="outline">
                                        {showEmptyMessages ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </Button>
                                }
                            />
                            <TooltipPopup>{showEmptyMessages ? 'Hide empty messages' : 'Show empty messages'}</TooltipPopup>
                        </Tooltip>

                        <Button
                            disabled={!hasSelection || isFetching}
                            onClick={() => {
                                refetch();
                            }}
                            size="icon-lg"
                            title={isFetching ? 'Refreshing events' : 'Refresh events'}
                            variant="outline"
                        >
                            {isFetching ? <Spinner className="size-4 text-muted-foreground" /> : <RefreshCw className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>

                {hasSelection ? (
                    error ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="text-center">
                                <p className="text-muted-foreground text-sm">Unable to load events</p>
                                <p className="mt-1 text-muted-foreground/70 text-xs">{error instanceof Error ? error.message : 'Please try again later'}</p>
                            </div>
                        </div>
                    ) : isLoading && !data ? (
                        <div className="flex items-center justify-center py-10">
                            <Spinner className="size-5 text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <TooltipProvider closeDelay={0} delay={0}>
                                <div className="mt-4 mb-4 flex h-16 items-end gap-px px-4">
                                    {histogram.map(bucket => {
                                        const height = maxCount > 0 ? Math.max(2, Math.round((bucket.count / maxCount) * HISTOGRAM_MAX_HEIGHT)) : 2;
                                        const isSelected = selectedBucket === bucket.interval;
                                        const formattedBucket = formatInTimeZone(new Date(bucket.interval), timezone, 'MMM dd HH:mm');
                                        const rangeLabel = formatBucketRange(bucket.interval, timezone);

                                        return (
                                            <Tooltip key={bucket.interval}>
                                                <TooltipTrigger
                                                    aria-label={`Filter to ${formattedBucket}`}
                                                    className="group flex h-full min-w-[2px] flex-1 items-end"
                                                    closeDelay={0}
                                                    delay={0}
                                                    onClick={() => handleBucketClick(bucket)}
                                                    type="button"
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
                                                <TooltipPopup>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-foreground">{rangeLabel}</span>
                                                        <span className="text-muted-foreground">
                                                            {bucket.count.toLocaleString()} {bucket.count === 1 ? 'event' : 'events'}
                                                        </span>
                                                    </div>
                                                </TooltipPopup>
                                            </Tooltip>
                                        );
                                    })}
                                </div>
                            </TooltipProvider>

                            <div className="grid grid-cols-[140px_210px_56px_1fr] gap-4 border-border border-b px-4 py-2 text-muted-foreground text-xs">
                                {HEADER_COLUMNS.map(column => (
                                    <div key={column}>{column}</div>
                                ))}
                            </div>

                            <ScrollArea className="h-[420px] max-h-[420px]" scrollbarGutter scrollFade>
                                {filteredEvents.length === 0 ? (
                                    <div className="flex items-center justify-center py-8">
                                        <p className="text-muted-foreground text-sm">{emptyStateCopy}</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border/60">
                                        {filteredEvents.map(row => {
                                            const isError = row.event.outcome === 'error';
                                            return (
                                                <button
                                                    className={cn(
                                                        'grid w-full min-w-0 cursor-pointer grid-cols-[140px_210px_56px_1fr] gap-4 border-0 bg-transparent px-4 py-2 text-left text-sm hover:bg-muted/50',
                                                        isError && 'bg-destructive/10'
                                                    )}
                                                    key={row.event.id}
                                                    onClick={() => setSelectedEvent(row.event)}
                                                    type="button"
                                                >
                                                    <div className="flex items-center">
                                                        <span className={cn(isError ? 'text-destructive-foreground/80' : 'text-muted-foreground')}>{row.formattedTime}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span className="truncate" title={row.event.jobName}>
                                                            {formatJobName(row.event.jobName)}
                                                        </span>
                                                    </div>
                                                    <div className={cn('font-mono text-xs', isError ? 'text-destructive-foreground' : 'text-success-foreground')}>
                                                        {OUTCOME_COPY[row.event.outcome]?.label ?? row.event.outcome}
                                                    </div>
                                                    <div className="min-w-0 truncate whitespace-nowrap text-muted-foreground">{renderMessage(row.event.message, row.event.badges)}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </>
                    )
                ) : (
                    <div className="flex items-center justify-center py-10">
                        <p className="text-muted-foreground text-sm">Select an account to view events</p>
                    </div>
                )}
            </Card>

            <Dialog onOpenChange={(open: boolean) => !open && setSelectedEvent(null)} open={Boolean(selectedEvent)}>
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
                                    <EventBadge badge={badge} key={badge} />
                                ))}
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-3">
                                <pre className="max-h-[50vh] overflow-auto font-mono text-muted-foreground text-xs">
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
        <Badge className="text-[11px]" variant={config.variant}>
            {config.label}
        </Badge>
    );
};

const EventBadge = ({ badge }: { badge: string }) => {
    return (
        <Badge className="text-[11px]" variant={getBadgeVariant(badge)}>
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
                    <EventBadge badge={badge} key={badge} />
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
                <EventBadge badge={badge} key={badge} />
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
    if (JOB_NAME_LABELS[jobName]) {
        return JOB_NAME_LABELS[jobName];
    }
    const normalized = jobName.replace(/[-_]+/g, ' ').trim();
    if (!normalized) {
        return jobName;
    }
    return normalized
        .split(' ')
        .filter(Boolean)
        .map(word => `${word[0]?.toUpperCase() ?? ''}${word.slice(1).toLowerCase()}`)
        .join(' ');
};

const roundUpToNearestFiveMinutes = (date: Date): Date => {
    return new Date(Math.ceil(date.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
};

const buildBaseRange = () => {
    const to = roundUpToNearestFiveMinutes(new Date());
    const from = new Date(to.getTime() - 12 * 60 * 60 * 1000);
    return { from, to };
};

const JOB_NAME_LABELS: Record<string, string> = {
    'summarize-daily-target-stream': 'Summarize Daily Target Stream',
    'summarize-hourly-target-stream': 'Summarize Hourly Target Stream',
    'update-report-dataset': 'Update Report Dataset',
    'update-report-status': 'Update Report Status',
};

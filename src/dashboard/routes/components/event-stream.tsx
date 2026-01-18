import { formatInTimeZone } from 'date-fns-tz';
import { useMemo, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { AlertTriangle, ChevronDown, Filter, MoreVertical, Play, RefreshCw, Search } from 'lucide-react';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { cn } from '../../lib/utils';
import { useEvents } from '../hooks/use-events';
import { roundUpToNearestMinute } from '../utils';
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

export const EventStream = () => {
    const accountId = useAtomValue(selectedAccountIdAtom);
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    const hasSelection = Boolean(accountId && countryCode);

    const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
    const [isLive, setIsLive] = useState(true);

    const baseRange = useMemo(() => {
        const to = roundUpToNearestMinute(new Date());
        const from = new Date(to.getTime() - 60 * 60 * 1000);
        return { from, to };
    }, []);

    const filterRange = useMemo(() => {
        if (!selectedBucket) {
            return null;
        }
        const start = new Date(selectedBucket);
        const end = new Date(start.getTime() + 60 * 1000);
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
        enabled: hasSelection,
        refetchInterval: isLive ? 60000 : false,
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

    const maxCount = useMemo(() => {
        return histogram.reduce((max, bucket) => Math.max(max, bucket.count), 0);
    }, [histogram]);

    const totalCount = useMemo(() => {
        return histogram.reduce((sum, bucket) => sum + bucket.count, 0);
    }, [histogram]);

    const selectedLabel = selectedBucket ? formatInTimeZone(new Date(selectedBucket), timezone, 'MMM dd HH:mm') : null;

    const handleBucketClick = (bucket: EventBucket) => {
        setSelectedBucket(current => (current === bucket.interval ? null : bucket.interval));
    };

    return (
        <>
            <Card className="font-mono pb-0 gap-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-4 px-4">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => setSelectedBucket(null)}
                        disabled={!selectedBucket}
                        title={selectedBucket ? 'Clear filter' : 'No filter'}
                    >
                        <Filter className="h-5 w-5" />
                    </Button>

                    <div className="flex-1 flex items-center gap-3 h-[32px] px-2 border border-input rounded-lg text-sm text-muted-foreground bg-background">
                        <Search className="h-5 w-5 text-muted-foreground" />
                        <span className="text-muted-foreground">{selectedLabel ? `Filtered to ${selectedLabel}` : `${totalCount.toLocaleString()} events (last 1h)`}</span>
                        <ChevronDown className="h-5 w-5 text-muted-foreground ml-auto" />
                    </div>

                    <Button variant="outline" className={cn('h-11 px-4 gap-2', isLive ? 'text-foreground' : 'text-muted-foreground')} onClick={() => setIsLive(current => !current)}>
                        <Play className="h-4 w-4 fill-current" />
                        Live
                    </Button>

                    <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => {
                            setSelectedBucket(null);
                            refetch();
                        }}
                    >
                        <RefreshCw className="h-5 w-5" />
                    </Button>

                    <Button variant="outline" size="icon" className="h-11 w-11">
                        <MoreVertical className="h-5 w-5" />
                    </Button>
                </div>

                {!hasSelection ? (
                    <div className="flex items-center justify-center py-10">
                        <p className="text-sm text-muted-foreground">Select an account to view events</p>
                    </div>
                ) : isLoading || isFetching ? (
                    <div className="flex items-center justify-center py-10">
                        <Spinner className="size-5 text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground">Unable to load events</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">{error instanceof Error ? error.message : 'Please try again later'}</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="h-20 flex items-end gap-px mb-4">
                            {histogram.map(bucket => {
                                const height = maxCount > 0 ? Math.max(2, Math.round((bucket.count / maxCount) * 48)) : 2;
                                const isSelected = selectedBucket === bucket.interval;
                                const formattedBucket = formatInTimeZone(new Date(bucket.interval), timezone, 'MMM dd HH:mm');

                                return (
                                    <button
                                        key={bucket.interval}
                                        type="button"
                                        className={cn('flex-1 min-w-[2px] transition-colors', bucket.count > 0 ? 'bg-muted-foreground/50' : 'bg-muted/70', isSelected && 'bg-foreground')}
                                        style={{ height }}
                                        title={`${formattedBucket} · ${bucket.count} events`}
                                        onClick={() => handleBucketClick(bucket)}
                                    />
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-[200px_160px_56px_1fr] gap-4 px-4 py-2 text-xs text-muted-foreground border-b border-border">
                            {HEADER_COLUMNS.map(column => (
                                <div key={column}>{column}</div>
                            ))}
                        </div>

                        {events.length === 0 ? (
                            <div className="flex items-center justify-center py-8">
                                <p className="text-sm text-muted-foreground">No events recorded yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/60">
                                {events.map(row => {
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
                                    <Badge key={badge} variant="outline" className="text-[11px]">
                                        {badge}
                                    </Badge>
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

const renderMessage = (message?: string | null, badges?: string[] | null): ReactNode => {
    if (!message) {
        return null;
    }

    if (!message.includes('{{badges}}')) {
        return <span className="inline-flex items-center gap-1 whitespace-nowrap">{message}</span>;
    }

    const [before, after] = message.split('{{badges}}');

    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {before?.trim() && <span>{before.trimEnd()}</span>}
            {badges?.map(badge => (
                <Badge key={badge} variant="outline" className="text-[11px]">
                    {badge}
                </Badge>
            ))}
            {after?.trim() && <span>{after.trimStart()}</span>}
        </span>
    );
};

const formatJobName = (jobName: string) => {
    return jobName.replace(/-/g, ' ');
};

import { formatInTimeZone } from 'date-fns-tz';
import { useMemo, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { AlertTriangle, ChevronDown, Filter, MoreVertical, Play, RefreshCw, Search } from 'lucide-react';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
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

    const selectedLabel = selectedBucket
        ? formatInTimeZone(new Date(selectedBucket), timezone, 'MMM dd HH:mm')
        : null;

    const handleBucketClick = (bucket: EventBucket) => {
        setSelectedBucket(current => (current === bucket.interval ? null : bucket.interval));
    };

    return (
        <>
            <div className="rounded-xl border border-neutral-800 bg-[#0d0d0d] text-neutral-300 p-4 font-mono">
                <div className="flex items-center gap-2 mb-4">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 border-neutral-700 bg-transparent hover:bg-neutral-800"
                        onClick={() => setSelectedBucket(null)}
                        disabled={!selectedBucket}
                        title={selectedBucket ? 'Clear filter' : 'No filter'}
                    >
                        <Filter className="h-5 w-5" />
                    </Button>

                    <div className="flex-1 flex items-center gap-3 h-11 px-4 bg-transparent border border-neutral-700 rounded-md text-sm">
                        <Search className="h-5 w-5 text-neutral-500" />
                        <span className="text-neutral-500">
                            {selectedLabel
                                ? `Filtered to ${selectedLabel}`
                                : `${totalCount.toLocaleString()} events (last 1h)`}
                        </span>
                        <ChevronDown className="h-5 w-5 text-neutral-500 ml-auto" />
                    </div>

                    <Button
                        variant="outline"
                        className={cn(
                            'h-11 px-4 gap-2 border-neutral-700 bg-transparent hover:bg-neutral-800',
                            isLive ? 'text-white' : 'text-neutral-500'
                        )}
                        onClick={() => setIsLive(current => !current)}
                    >
                        <Play className="h-4 w-4 fill-current" />
                        Live
                    </Button>

                    <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 border-neutral-700 bg-transparent hover:bg-neutral-800"
                        onClick={() => {
                            setSelectedBucket(null);
                            refetch();
                        }}
                    >
                        <RefreshCw className="h-5 w-5" />
                    </Button>

                    <Button variant="outline" size="icon" className="h-11 w-11 border-neutral-700 bg-transparent hover:bg-neutral-800">
                        <MoreVertical className="h-5 w-5" />
                    </Button>
                </div>

                {!hasSelection ? (
                    <div className="flex items-center justify-center py-10">
                        <p className="text-sm text-neutral-500">Select an account to view events</p>
                    </div>
                ) : isLoading || isFetching ? (
                    <div className="flex items-center justify-center py-10">
                        <Spinner className="size-5 text-neutral-500" />
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="text-center">
                            <p className="text-sm text-neutral-500">Unable to load events</p>
                            <p className="text-xs text-neutral-600 mt-1">{error instanceof Error ? error.message : 'Please try again later'}</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="h-16 flex items-end gap-px mb-4 px-2">
                            {histogram.map(bucket => {
                                const height = maxCount > 0 ? Math.max(2, Math.round((bucket.count / maxCount) * 48)) : 2;
                                const isSelected = selectedBucket === bucket.interval;
                                const formattedBucket = formatInTimeZone(new Date(bucket.interval), timezone, 'MMM dd HH:mm');

                                return (
                                    <button
                                        key={bucket.interval}
                                        type="button"
                                        className={cn(
                                            'flex-1 min-w-[2px] transition-colors',
                                            bucket.count > 0 ? 'bg-neutral-600' : 'bg-neutral-800',
                                            isSelected && 'bg-neutral-200'
                                        )}
                                        style={{ height }}
                                        title={`${formattedBucket} · ${bucket.count} events`}
                                        onClick={() => handleBucketClick(bucket)}
                                    />
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-[200px_160px_110px_1fr] gap-4 px-4 py-2 text-xs text-neutral-500 border-b border-neutral-800">
                            {HEADER_COLUMNS.map(column => (
                                <div key={column}>{column}</div>
                            ))}
                        </div>

                        {events.length === 0 ? (
                            <div className="flex items-center justify-center py-8">
                                <p className="text-sm text-neutral-500">No events recorded yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-neutral-800/50">
                                {events.map(row => {
                                    const isError = row.event.outcome === 'error';
                                    return (
                                        <div
                                            key={row.event.id}
                                            className={cn(
                                                'grid grid-cols-[200px_160px_110px_1fr] gap-4 px-4 py-2 text-sm hover:bg-neutral-800/30 transition-colors cursor-pointer',
                                                isError && 'bg-red-950/40'
                                            )}
                                            onClick={() => setSelectedEvent(row.event)}
                                        >
                                            <div className="flex items-center gap-2">
                                                {isError && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                                <span className={isError ? 'text-red-300' : 'text-neutral-300'}>{row.formattedTime}</span>
                                            </div>
                                            <div className="flex items-center gap-2 truncate">
                                                <span className="text-neutral-300 truncate" title={row.event.jobName}>
                                                    {formatJobName(row.event.jobName)}
                                                </span>
                                            </div>
                                            <div className={cn('font-mono', isError ? 'text-red-400' : 'text-green-500')}>
                                                {OUTCOME_COPY[row.event.outcome]?.label ?? row.event.outcome}
                                            </div>
                                            <div className="text-neutral-400 truncate">{renderMessage(row.event.message, row.event.badges)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

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
                                <span className="text-muted-foreground">
                                    {formatInTimeZone(new Date(selectedEvent.createdAt), timezone, 'MMM dd HH:mm:ss.SSS')}
                                </span>
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
        return message;
    }

    const [before, after] = message.split('{{badges}}');

    return (
        <span className="inline-flex flex-wrap items-center gap-1">
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

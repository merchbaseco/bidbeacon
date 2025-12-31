import { format, formatDistanceToNow } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangleIcon, CheckIcon, Loader2Icon, RefreshCcwIcon, TerminalIcon, XIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardTitle } from '../../components/ui/card';
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
} from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { cn } from '../../lib/utils';
import { useJobEvents } from '../hooks/use-job-events';

type JobEvent = RouterOutputs['metrics']['jobEvents'][number];

const TIMELINE_MARKERS: Record<string, { Icon: LucideIcon; className: string }> = {
    failed: { Icon: XIcon, className: 'border-red-400 bg-red-100 text-red-600 dark:border-red-400/70 dark:bg-red-400/10 dark:text-red-200' },
    succeeded: { Icon: CheckIcon, className: 'border-emerald-400 bg-emerald-100 text-emerald-700 dark:border-emerald-400/70 dark:bg-emerald-400/10 dark:text-emerald-200' },
    running: { Icon: Loader2Icon, className: 'border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-400/70 dark:bg-amber-400/10 dark:text-amber-200' },
};

const DEFAULT_MARKER: { Icon: LucideIcon; className: string } = {
    Icon: TerminalIcon,
    className: 'border-muted-foreground/40 bg-muted text-muted-foreground dark:border-white/20 dark:bg-white/10 dark:text-white/70',
};

const formatTimestamp = (value: string) => {
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.max(1, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    let relativeShort: string;
    if (diffSec < 60) {
        relativeShort = `${diffSec}s ago`;
    } else if (diffMin < 60) {
        relativeShort = `${diffMin}m ago`;
    } else if (diffHour < 24) {
        relativeShort = `${diffHour}h ago`;
    } else {
        relativeShort = `${diffDay}d ago`;
    }

    return {
        absolute: format(date, 'MMM d • HH:mm:ss'),
        relative: formatDistanceToNow(date, { addSuffix: true }),
        relativeShort,
    };
};

const Tag = ({ children }: { children: ReactNode }) => (
    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.15em]">
        {children}
    </Badge>
);

function getMarker(status?: string | null) {
    if (!status) {
        return DEFAULT_MARKER;
    }
    return TIMELINE_MARKERS[status] ?? DEFAULT_MARKER;
}

export function JobEventsFeed() {
    const { data, isLoading, isFetching, error, refetch } = useJobEvents({ limit: 20 });
    const [selectedEvent, setSelectedEvent] = useState<JobEvent | null>(null);

    const events = data ?? [];
    const groupedEvents = useMemo(() => {
        const groups: Array<{ sessionId: string; events: JobEvent[] }> = [];
        for (const event of events) {
            const last = groups[groups.length - 1];
            if (last && last.sessionId === event.sessionId) {
                last.events.push(event);
            } else {
                groups.push({ sessionId: event.sessionId, events: [event] });
            }
        }
        return groups;
    }, [events]);

    const handleSelect = (event: JobEvent) => {
        setSelectedEvent(event);
    };

    return (
        <>
            <Card>
                <CardHeader className="pb-3">
                    <div>
                        <CardTitle className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">Job events</CardTitle>
                        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                            Real-time timeline of worker sessions.
                        </CardDescription>
                    </div>
                    <CardAction>
                        <Button
                            size="sm"
                            variant="outline"
                            className="font-mono text-[10px] uppercase tracking-[0.3em]"
                            onClick={() => refetch()}
                            disabled={isFetching}
                        >
                            <RefreshCcwIcon className={cn('size-4', isFetching && 'animate-spin')} />
                            Pulse
                        </Button>
                    </CardAction>
                </CardHeader>
                <CardPanel className="pt-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Spinner className="size-6 text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-3 rounded-lg border border-red-400/40 bg-red-100/60 px-4 py-3 font-mono text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100">
                            <AlertTriangleIcon className="size-4" />
                            <span>Failed to load job events. {error instanceof Error ? error.message : 'Unknown error'}.</span>
                        </div>
                    ) : groupedEvents.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-muted px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                            No job events recorded yet.
                        </div>
                    ) : (
                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-0 h-full w-px bg-muted-foreground/30" aria-hidden />
                            <ul className="space-y-0.5">
                                {groupedEvents.map(group => {
                                    const [primary, ...rest] = group.events;
                                    const timestamp = formatTimestamp(primary.occurredAt);
                                    const marker = getMarker(primary.status);
                                    const MarkerIcon = marker.Icon;

                                    return (
                                        <li key={group.sessionId} className="relative rounded py-2 pl-9 pr-3 hover:bg-muted/40">
                                            <div
                                                className="flex cursor-pointer flex-wrap items-center gap-2 font-mono text-[13px] text-foreground"
                                                onClick={() => handleSelect(primary)}
                                            >
                                                <span className={cn('absolute left-3 top-4 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[10px]', marker.className)}>
                                                    <MarkerIcon className={cn('size-3', primary.status === 'running' && 'animate-spin')} />
                                                </span>
                                                <div className="pl-5 flex flex-wrap items-center gap-2">
                                                    <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                                        {timestamp.absolute}
                                                        <span className="text-muted-foreground/40">•</span>
                                                        <span className="text-emerald-600 dark:text-emerald-300">{timestamp.relativeShort}</span>
                                                    </span>
                                                <span className="text-foreground">{primary.headline ?? primary.jobName}</span>
                                                {primary.status && <Tag>{primary.status}</Tag>}
                                            </div>
                                        </div>
                                            {rest.length > 0 && (
                                                <ul className="ml-4 mt-1 border-l border-dashed border-muted-foreground/40 pl-3">
                                                    {rest.map(event => {
                                                        const nestedTimestamp = formatTimestamp(event.occurredAt);
                                                        return (
                                                            <li
                                                                key={event.id}
                                                                className="flex cursor-pointer flex-wrap items-center gap-2 py-1 text-xs text-muted-foreground"
                                                                onClick={() => handleSelect(event)}
                                                            >
                                                                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                                                    {nestedTimestamp.relativeShort}
                                                                </span>
                                                                <span className="font-mono text-[12px] text-foreground">{event.headline ?? event.eventType}</span>
                                                                {event.detail && <span className="font-mono text-[11px] text-muted-foreground">{event.detail}</span>}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </CardPanel>
            </Card>

            <Dialog open={Boolean(selectedEvent)} onOpenChange={(open: boolean) => !open && setSelectedEvent(null)}>
                <DialogPopup className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-base tracking-wide">{selectedEvent?.headline ?? 'Job Event'}</DialogTitle>
                        <DialogDescription className="font-mono text-xs uppercase tracking-[0.3em]">
                            Full payload for this job event.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedEvent && (
                        <DialogPanel className="space-y-6 font-mono text-sm">
                            <div className="grid gap-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                                <div className="flex items-center justify-between">
                                    <span>{selectedEvent.jobName}</span>
                                    <span>{formatTimestamp(selectedEvent.occurredAt).absolute}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[11px]">
                                    {selectedEvent.status && <Tag>{selectedEvent.status}</Tag>}
                                    {selectedEvent.stage && <Tag>{selectedEvent.stage}</Tag>}
                                    {selectedEvent.eventType && <Tag>{selectedEvent.eventType}</Tag>}
                                </div>
                            </div>
                            <div className="rounded-xl border border-muted bg-muted/40 p-4 text-xs text-muted-foreground">
                                <pre className="max-h-[55vh] overflow-auto">
                                    <code>{JSON.stringify(selectedEvent, null, 2)}</code>
                                </pre>
                            </div>
                        </DialogPanel>
                    )}
                    <DialogFooter>
                        <DialogClose>
                            <Button variant="outline" className="font-mono uppercase tracking-[0.3em]">
                                Close
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogPopup>
            </Dialog>
        </>
    );
}

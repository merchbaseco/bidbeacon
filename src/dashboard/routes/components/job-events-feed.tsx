import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangleIcon, CheckIcon, RefreshCcwIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
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

const STATUS_ICON = {
    failed: <XIcon className="size-3.5" />,
    succeeded: <CheckIcon className="size-3.5" />,
    running: <RefreshCcwIcon className="size-3.5" />,
} as const;

const STATUS_VARIANTS: Record<string, 'error' | 'success' | 'info' | 'outline'> = {
    failed: 'error',
    succeeded: 'success',
    running: 'info',
};

const formatTimestamp = (value: string) => {
    const date = new Date(value);
    return {
        absolute: format(date, 'MMM d, HH:mm:ss'),
        relative: formatDistanceToNow(date, { addSuffix: true }),
    };
};

export function JobEventsFeed() {
    const { data, isLoading, isFetching, error, refetch } = useJobEvents({ limit: 40 });
    const [selectedEvent, setSelectedEvent] = useState<JobEvent | null>(null);

    const events = data ?? [];

    const handleSelect = (event: JobEvent) => {
        setSelectedEvent(event);
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Job activity</CardTitle>
                        <CardDescription>Live feed of job sessions and events from the worker.</CardDescription>
                    </div>
                    <CardAction>
                        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                            <RefreshCcwIcon className={cn('size-4', isFetching && 'animate-spin')} />
                            Refresh
                        </Button>
                    </CardAction>
                </CardHeader>
                <CardPanel className="pt-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Spinner className="size-6" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                            <AlertTriangleIcon className="size-4" />
                            <span>Failed to load job events. {error instanceof Error ? error.message : 'Unknown error'}.</span>
                        </div>
                    ) : events.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-muted-foreground/30 px-4 py-6 text-center text-sm text-muted-foreground">
                            No job events recorded yet.
                        </div>
                    ) : (
                        <ul className="divide-y divide-border rounded-xl border border-border/60 bg-muted/10">
                            {events.map(event => (
                                <li key={event.id}>
                                    <button
                                        type="button"
                                        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        onClick={() => handleSelect(event)}
                                    >
                                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                            <span>{formatTimestamp(event.occurredAt).relative}</span>
                                            <div className="flex items-center gap-1">
                                                <Badge size="sm" variant="outline">
                                                    {event.jobName}
                                                </Badge>
                                                {event.status && (
                                                    <Badge size="sm" variant={STATUS_VARIANTS[event.status] ?? 'outline'}>
                                                        {STATUS_ICON[event.status as keyof typeof STATUS_ICON]}
                                                        {event.status}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-sm font-medium text-foreground">{event.headline}</div>
                                        {event.detail && <div className="text-xs text-muted-foreground">{event.detail}</div>}
                                        <div className="flex flex-wrap gap-1.5">
                                            {event.accountId && event.countryCode && (
                                                <Badge size="sm" variant="outline">
                                                    {event.accountId}
                                                    <span className="text-muted-foreground/70"> · </span>
                                                    {event.countryCode}
                                                </Badge>
                                            )}
                                            {event.datasetId && (
                                                <Badge size="sm" variant="outline">
                                                    Dataset {event.datasetId}
                                                </Badge>
                                            )}
                                            {event.bucketDate && (
                                                <Badge size="sm" variant="outline">
                                                    {event.bucketDate}
                                                </Badge>
                                            )}
                                            {event.entityType && (
                                                <Badge size="sm" variant="outline">
                                                    {event.entityType}
                                                </Badge>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardPanel>
            </Card>

            <Dialog open={Boolean(selectedEvent)} onOpenChange={(open: boolean) => !open && setSelectedEvent(null)}>
                <DialogPopup className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{selectedEvent?.headline ?? 'Job Event'}</DialogTitle>
                        <DialogDescription>Full payload for this job event.</DialogDescription>
                    </DialogHeader>
                    {selectedEvent && (
                        <DialogPanel className="space-y-6">
                            <div className="grid gap-2 text-sm">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>{selectedEvent.jobName}</span>
                                    <span>{formatTimestamp(selectedEvent.occurredAt).absolute}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedEvent.status && (
                                        <Badge size="sm" variant={STATUS_VARIANTS[selectedEvent.status] ?? 'outline'}>
                                            {selectedEvent.status}
                                        </Badge>
                                    )}
                                    {selectedEvent.stage && (
                                        <Badge size="sm" variant="outline">
                                            {selectedEvent.stage}
                                        </Badge>
                                    )}
                                    {selectedEvent.eventType && (
                                        <Badge size="sm" variant="outline">
                                            {selectedEvent.eventType}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="rounded-lg border bg-muted/40 p-4">
                                <pre className="max-h-[50vh] overflow-auto text-xs leading-relaxed">
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
}

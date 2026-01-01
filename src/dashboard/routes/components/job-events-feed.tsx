import { format, formatDistanceToNow } from 'date-fns';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { HugeiconsIcon } from '@hugeicons/react';
import AlertCircleIcon from '@merchbaseco/icons/core-solid-rounded/AlertCircleIcon';
import TickDouble03Icon from '@merchbaseco/icons/core-solid-rounded/TickDouble03Icon';
import ComputerTerminal01Icon from '@merchbaseco/icons/core-solid-rounded/ComputerTerminal01Icon';
import RemoveCircleIcon from '@merchbaseco/icons/core-solid-rounded/RemoveCircleIcon';
import TimeScheduleIcon from '@merchbaseco/icons/core-solid-rounded/TimeScheduleIcon';
import DatabaseAddIcon from '@merchbaseco/icons/core-stroke-rounded/DatabaseAddIcon';
import Queue01Icon from '@merchbaseco/icons/core-stroke-rounded/Queue01Icon';
import ChartBarLineIcon from '@merchbaseco/icons/core-stroke-rounded/ChartBarLineIcon';
import FolderInfoIcon from '@merchbaseco/icons/core-stroke-rounded/FolderInfoIcon';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { cn } from '../../lib/utils';
import { useJobEvents } from '../hooks/use-job-events';
import { selectedAccountIdAtom, selectedCountryCodeAtom } from './account-selector/atoms';

type JobEvent = RouterOutputs['metrics']['jobEvents'][number];

const SESSION_MARKERS = {
    failed: { icon: RemoveCircleIcon, className: 'border-red-400 text-red-600 dark:border-red-500 dark:text-red-200' },
    succeeded: { icon: TickDouble03Icon, className: 'border-emerald-400 text-emerald-700 dark:border-emerald-400/70 dark:text-emerald-200' },
    running: { icon: TimeScheduleIcon, className: 'border-amber-400 text-amber-600 dark:border-amber-400/70 dark:text-amber-200' },
} as const;

const DEFAULT_MARKER = {
    icon: ComputerTerminal01Icon,
    className: 'border-muted-foreground/40 text-muted-foreground dark:border-white/20 dark:text-white/70',
};

const EVENT_MARKERS: Record<
    string,
    {
        icon: ComponentType;
        className: string;
    }
> = {
    'report-datasets': { icon: DatabaseAddIcon, className: 'border-emerald-300 text-emerald-600 dark:border-emerald-400/80 dark:text-emerald-200' },
    'reports:enqueue': { icon: Queue01Icon, className: 'border-sky-300 text-sky-600 dark:border-sky-400/80 dark:text-sky-200' },
    'ams-summary': { icon: ChartBarLineIcon, className: 'border-purple-300 text-purple-600 dark:border-purple-400/80 dark:text-purple-200' },
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

type SessionState = 'started' | 'succeeded' | 'failed';

const JOB_TITLES: Record<
    string,
    {
        label: string;
        verbs?: Partial<Record<SessionState, string>>;
    }
> = {
    'update-report-dataset-for-account': { label: 'reports dataset', verbs: { started: 'Started', succeeded: 'Updated', failed: 'Failed' } },
    'update-report-datasets': { label: 'dataset queue', verbs: { started: 'Started', succeeded: 'Queued', failed: 'Failed' } },
    'update-report-status': { label: 'report status', verbs: { started: 'Started', succeeded: 'Updated', failed: 'Failed' } },
    'summarize-daily-target-stream-for-account': { label: 'daily targets', verbs: { started: 'Started', succeeded: 'Summarized', failed: 'Failed' } },
    'summarize-hourly-target-stream-for-account': { label: 'hourly targets', verbs: { started: 'Started', succeeded: 'Summarized', failed: 'Failed' } },
    'summarize-daily-target-stream': { label: 'daily summary', verbs: { started: 'Started', succeeded: 'Summarized', failed: 'Failed' } },
    'summarize-hourly-target-stream': { label: 'hourly summary', verbs: { started: 'Started', succeeded: 'Summarized', failed: 'Failed' } },
    'sync-ad-entities': { label: 'ad entities', verbs: { started: 'Started', succeeded: 'Synced', failed: 'Failed' } },
    'cleanup-ams-metrics': { label: 'AMS metrics', verbs: { started: 'Started', succeeded: 'Cleaned', failed: 'Failed' } },
};

const DEFAULT_VERBS: Record<SessionState, string> = {
    started: 'Started job',
    succeeded: 'Completed',
    failed: 'Failed',
};

const DEFAULT_EVENT_MARKER = { icon: FolderInfoIcon, className: 'border-muted-foreground/40 text-muted-foreground' };

function getSessionMarker(status?: string | null) {
    if (!status) {
        return DEFAULT_MARKER;
    }
    if (status in SESSION_MARKERS) {
        return SESSION_MARKERS[status as keyof typeof SESSION_MARKERS];
    }
    return DEFAULT_MARKER;
}

function getEventMarker(eventType: string) {
    if (eventType in EVENT_MARKERS) {
        return EVENT_MARKERS[eventType as keyof typeof EVENT_MARKERS];
    }
    return DEFAULT_EVENT_MARKER;
}

export function JobEventsFeed() {
    const accountId = useAtomValue(selectedAccountIdAtom);
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    const hasSelection = Boolean(accountId && countryCode);

    const { data, isLoading, isFetching, error, refetch } = useJobEvents({
        limit: 20,
        accountId: accountId || undefined,
        countryCode: countryCode || undefined,
        enabled: hasSelection,
    });
    const [selectedEvent, setSelectedEvent] = useState<JobEvent | null>(null);

    const events = data ?? [];
    const timelineRows = useMemo(() => {
        const groups = new Map<string, JobEvent[]>();
        const order: string[] = [];

        for (const event of events) {
            const existing = groups.get(event.sessionId);
            if (existing) {
                existing.push(event);
            } else {
                groups.set(event.sessionId, [event]);
                order.push(event.sessionId);
            }
        }

        const rows: Array<{ event: JobEvent; depth: number; isSession: boolean }> = [];
        order.forEach(sessionId => {
            const groupEvents = groups.get(sessionId)!;
            groupEvents.forEach((event, index) => {
                rows.push({
                    event,
                    depth: index === 0 ? 0 : 1,
                    isSession: index === 0,
                });
            });
        });
        return rows;
    }, [events]);

    const handleSelect = (event: JobEvent) => {
        setSelectedEvent(event);
    };

    return (
        <>
            <Card className="p-3 px-0 pb-1 space-y-0 gap-0">
                <div className="flex items-start justify-between pb-1 pr-3 pl-4">
                    <div>
                        <div className="text-sm font-medium">Event Stream</div>
                    </div>
                </div>
                {!hasSelection ? (
                    <div className="rounded-lg border border-dashed border-muted px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                        Select an account to view job events.
                    </div>
                ) : isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Spinner className="size-6 text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-3 rounded-lg border border-red-400/40 bg-red-100/60 px-4 py-3 font-mono text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100">
                        <HugeiconsIcon icon={AlertCircleIcon} size={16} color="currentColor" />
                        <span>Failed to load job events. {error instanceof Error ? error.message : 'Unknown error'}.</span>
                    </div>
                ) : timelineRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-muted px-4 py-6 text-center font-mono text-xs text-muted-foreground">No job events recorded yet.</div>
                ) : (
                    <div className="relative">
                        <span className="pointer-events-none absolute left-6 top-0 h-full w-px bg-muted-foreground/30" aria-hidden />
                        <ul className="space-y-1">
                            {timelineRows.map(row => (
                                <EventRow key={row.event.id} row={row} onSelect={handleSelect} />
                            ))}
                        </ul>
                    </div>
                )}
            </Card>

            <Dialog open={Boolean(selectedEvent)} onOpenChange={(open: boolean) => !open && setSelectedEvent(null)}>
                <DialogPopup className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-base tracking-wide">{selectedEvent ? formatEventHeadline(selectedEvent) : 'Job Event'}</DialogTitle>
                        <DialogDescription className="font-mono text-xs uppercase tracking-[0.3em]">Full payload for this job event.</DialogDescription>
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

function formatEventHeadline(event: JobEvent) {
    if (event.eventType === 'session') {
        return formatSessionHeadline(event);
    }
    return event.message ?? event.eventType;
}

function formatSessionHeadline(event: JobEvent) {
    const stateMetadata = (event.metadata?.sessionState as SessionState | undefined) ?? (event.status === 'succeeded' ? 'succeeded' : event.status === 'failed' ? 'failed' : 'started');
    const jobCopy = JOB_TITLES[event.jobName] ?? { label: event.jobName };
    const verb = jobCopy.verbs?.[stateMetadata] ?? DEFAULT_VERBS[stateMetadata];
    const bucket = formatBucketLabel(event);
    const parts = [`${verb} ${jobCopy.label}`];
    if (bucket) {
        parts.push(`for ${bucket}`);
    }
    return parts.join(' ');
}

function formatBucketLabel(event: JobEvent) {
    if (event.bucketStart) {
        return format(new Date(event.bucketStart), 'MM/dd h:mmaaa');
    }
    if (event.bucketDate) {
        return format(new Date(event.bucketDate), 'MM/dd');
    }
    return '';
}

type TimelineRow = {
    event: JobEvent;
    depth: number;
    isSession: boolean;
};

function EventRow({ row, onSelect }: { row: TimelineRow; onSelect: (event: JobEvent) => void }) {
    const { event, depth, isSession } = row;
    const timestamp = formatTimestamp(event.occurredAt);
    const marker = isSession ? getSessionMarker(event.status) : getEventMarker(event.eventType);

    return (
        <li
            className={cn(
                'flex cursor-pointer items-center gap-2 rounded pl-10 pr-3 font-mono text-[13px] hover:bg-muted/40',
                depth > 0 ? 'text-muted-foreground pl-14' : 'text-foreground font-semibold'
            )}
            onClick={() => onSelect(event)}
        >
            <span
                className={cn(
                    'mr-1 flex size-5 -translate-x-5 items-center justify-center rounded-full border bg-background text-[10px]',
                    depth > 0 && '-translate-x-9',
                    marker.className
                )}
            >
                <HugeiconsIcon icon={marker.icon} size={14} color="currentColor" />
            </span>
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {timestamp.absolute}
                <span className="text-muted-foreground/40">•</span>
                <span className="text-emerald-600 dark:text-emerald-300">{timestamp.relativeShort}</span>
            </span>
            <span className={cn('truncate', depth > 0 ? 'font-normal text-foreground' : '')}>{formatEventHeadline(event)}</span>
            {isSession && event.status && <Tag>{event.status}</Tag>}
        </li>
    );
}

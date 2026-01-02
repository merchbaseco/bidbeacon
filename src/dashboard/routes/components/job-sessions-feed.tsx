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
import InformationCircleIcon from '@merchbaseco/icons/core-solid-rounded/InformationCircleIcon';
import type { RouterOutputs } from '@/dashboard/lib/trpc';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '../../components/ui/dialog';
import { Spinner } from '../../components/ui/spinner';
import { cn } from '../../lib/utils';
import { useJobSessions } from '../hooks/use-job-sessions';
import { selectedAccountIdAtom, selectedCountryCodeAtom } from './account-selector/atoms';

type JobSession = RouterOutputs['metrics']['jobSessions'][number];

type JobAction = {
    type?: string;
    at?: string;
    [key: string]: unknown;
};

const SESSION_MARKERS = {
    failed: { icon: RemoveCircleIcon, className: 'border-red-400 text-red-600 dark:border-red-500 dark:text-red-200' },
    succeeded: { icon: TickDouble03Icon, className: 'border-emerald-400 text-emerald-700 dark:border-emerald-400/70 dark:text-emerald-200' },
    running: { icon: TimeScheduleIcon, className: 'border-amber-400 text-amber-600 dark:border-amber-400/70 dark:text-amber-200' },
} as const;

const DEFAULT_MARKER = {
    icon: ComputerTerminal01Icon,
    className: 'border-muted-foreground/40 text-muted-foreground dark:border-white/20 dark:text-white/70',
};

const ACTION_MARKERS: Record<
    string,
    {
        icon: ComponentType;
        className: string;
    }
> = {
    'report-dataset-scan': { icon: DatabaseAddIcon, className: 'border-emerald-300 text-emerald-600 dark:border-emerald-400/80 dark:text-emerald-200' },
    'report-dataset-cleanup': { icon: RemoveCircleIcon, className: 'border-amber-300 text-amber-600 dark:border-amber-400/70 dark:text-amber-200' },
    'report-dataset-backfill': { icon: DatabaseAddIcon, className: 'border-emerald-300 text-emerald-600 dark:border-emerald-400/80 dark:text-emerald-200' },
    'report-dataset-enqueue-summary': { icon: Queue01Icon, className: 'border-sky-300 text-sky-600 dark:border-sky-400/80 dark:text-sky-200' },
    'enqueue-report-dataset-for-account': { icon: Queue01Icon, className: 'border-sky-300 text-sky-600 dark:border-sky-400/80 dark:text-sky-200' },
    'enqueue-report-status': { icon: Queue01Icon, className: 'border-sky-300 text-sky-600 dark:border-sky-400/80 dark:text-sky-200' },
    'report-status-queued': { icon: Queue01Icon, className: 'border-sky-300 text-sky-600 dark:border-sky-400/80 dark:text-sky-200' },
    'report-status-processed': { icon: TickDouble03Icon, className: 'border-emerald-300 text-emerald-600 dark:border-emerald-400/80 dark:text-emerald-200' },
    'report-status-checked': { icon: ComputerTerminal01Icon, className: 'border-muted-foreground/40 text-muted-foreground' },
    'ams-summary-enqueue': { icon: ChartBarLineIcon, className: 'border-purple-300 text-purple-600 dark:border-purple-400/80 dark:text-purple-200' },
    'ams-summary-complete': { icon: ChartBarLineIcon, className: 'border-purple-300 text-purple-600 dark:border-purple-400/80 dark:text-purple-200' },
    'ams-summary-skipped': { icon: RemoveCircleIcon, className: 'border-red-300 text-red-600 dark:border-red-400/80 dark:text-red-200' },
    'exports-created': { icon: DatabaseAddIcon, className: 'border-emerald-300 text-emerald-600 dark:border-emerald-400/80 dark:text-emerald-200' },
    'export-failed': { icon: AlertCircleIcon, className: 'border-red-400 text-red-600 dark:border-red-500 dark:text-red-200' },
    'entities-synced': { icon: TickDouble03Icon, className: 'border-emerald-400 text-emerald-700 dark:border-emerald-400/70 dark:text-emerald-200' },
    'cleanup-ams-metrics': { icon: RemoveCircleIcon, className: 'border-amber-300 text-amber-600 dark:border-amber-400/70 dark:text-amber-200' },
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
        absolute: format(date, 'MMM d - HH:mm:ss'),
        relative: formatDistanceToNow(date, { addSuffix: true }),
        relativeShort,
    };
};

const Tag = ({ children }: { children: ReactNode }) => (
    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.15em]">
        {children}
    </Badge>
);

type SessionState = 'running' | 'succeeded' | 'failed';

const JOB_TITLES: Record<
    string,
    {
        label: string;
        verbs?: Partial<Record<SessionState, string>>;
    }
> = {
    'update-report-dataset-for-account': { label: 'reports dataset', verbs: { running: 'Started', succeeded: 'Updated', failed: 'Failed' } },
    'update-report-datasets': { label: 'dataset queue', verbs: { running: 'Started', succeeded: 'Queued', failed: 'Failed' } },
    'update-report-status': { label: 'report status', verbs: { running: 'Started', succeeded: 'Updated', failed: 'Failed' } },
    'summarize-daily-target-stream-for-account': { label: 'daily targets', verbs: { running: 'Started', succeeded: 'Summarized', failed: 'Failed' } },
    'summarize-hourly-target-stream-for-account': { label: 'hourly targets', verbs: { running: 'Started', succeeded: 'Summarized', failed: 'Failed' } },
    'summarize-daily-target-stream': { label: 'daily summary', verbs: { running: 'Started', succeeded: 'Queued', failed: 'Failed' } },
    'summarize-hourly-target-stream': { label: 'hourly summary', verbs: { running: 'Started', succeeded: 'Queued', failed: 'Failed' } },
    'sync-ad-entities': { label: 'ad entities', verbs: { running: 'Started', succeeded: 'Synced', failed: 'Failed' } },
    'cleanup-ams-metrics': { label: 'AMS metrics', verbs: { running: 'Started', succeeded: 'Cleaned', failed: 'Failed' } },
};

const DEFAULT_VERBS: Record<SessionState, string> = {
    running: 'Started job',
    succeeded: 'Completed',
    failed: 'Failed',
};

const DEFAULT_ACTION_MARKER = { icon: InformationCircleIcon, className: 'border-muted-foreground/40 text-muted-foreground' };

const getSessionMarker = (status?: string | null) => {
    if (!status) {
        return DEFAULT_MARKER;
    }
    if (status in SESSION_MARKERS) {
        return SESSION_MARKERS[status as keyof typeof SESSION_MARKERS];
    }
    return DEFAULT_MARKER;
};

const getActionMarker = (actionType: string) => {
    if (actionType in ACTION_MARKERS) {
        return ACTION_MARKERS[actionType as keyof typeof ACTION_MARKERS];
    }
    return DEFAULT_ACTION_MARKER;
};

const formatAccountTag = (accountId: string, countryCode: string) => {
    const segments = accountId.split('.');
    const shortId = (segments[segments.length - 1] ?? accountId).slice(-6).toUpperCase();
    return `${shortId}/${countryCode}`;
};

const formatReportTimestamp = (timestamp: string, aggregation?: string) => {
    const date = new Date(timestamp);
    if (aggregation === 'daily') {
        return format(date, 'MMM d');
    }
    return format(date, 'MMM d HH:mm');
};

const formatActionTimestamp = (value?: string) => {
    if (!value) {
        return '';
    }
    return format(new Date(value), 'MMM d HH:mm');
};

const getActionType = (action: JobAction) => (typeof action.type === 'string' ? action.type : 'action');

const getActionTimestamp = (action: JobAction, session: JobSession) => {
    if (typeof action.at === 'string') {
        return action.at;
    }
    return session.startedAt;
};

const getSessionHeadline = (session: JobSession) => {
    const jobCopy = JOB_TITLES[session.jobName] ?? { label: session.jobName };
    const status = (session.status ?? 'running') as SessionState;
    const verb = jobCopy.verbs?.[status] ?? DEFAULT_VERBS[status];
    return `${verb} ${jobCopy.label}`;
};

const getSessionAccountTag = (session: JobSession) => {
    const input = session.input ?? {};
    const accountId = typeof input.accountId === 'string' ? input.accountId : null;
    const countryCode = typeof input.countryCode === 'string' ? input.countryCode : null;
    if (!accountId || !countryCode) {
        return null;
    }
    return formatAccountTag(accountId, countryCode);
};

const renderActionContent = (action: JobAction) => {
    const actionType = getActionType(action);

    switch (actionType) {
        case 'enqueue-report-status': {
            const input = typeof action.input === 'object' && action.input ? (action.input as Record<string, unknown>) : {};
            const timestamp = typeof input.timestamp === 'string' ? input.timestamp : undefined;
            const aggregation = typeof input.aggregation === 'string' ? input.aggregation : undefined;
            return (
                <span className="flex items-center gap-2">
                    <span>Queued report status</span>
                    {timestamp && <Badge variant="secondary">{formatReportTimestamp(timestamp, aggregation)}</Badge>}
                </span>
            );
        }
        case 'report-status-queued':
        case 'report-status-processed':
        case 'report-status-checked': {
            const timestamp = typeof action.timestamp === 'string' ? action.timestamp : undefined;
            const aggregation = typeof action.aggregation === 'string' ? action.aggregation : undefined;
            const label =
                actionType === 'report-status-queued'
                    ? 'Queued report'
                    : actionType === 'report-status-processed'
                      ? 'Processed report'
                      : 'Checked report';
            return (
                <span className="flex items-center gap-2">
                    <span>{label}</span>
                    {timestamp && <Badge variant="secondary">{formatReportTimestamp(timestamp, aggregation)}</Badge>}
                </span>
            );
        }
        case 'report-dataset-scan': {
            const dailyEnqueued = typeof action.dailyEnqueuedCount === 'number' ? action.dailyEnqueuedCount : 0;
            const hourlyEnqueued = typeof action.hourlyEnqueuedCount === 'number' ? action.hourlyEnqueuedCount : 0;
            const totalEnqueued = typeof action.totalEnqueuedCount === 'number' ? action.totalEnqueuedCount : 0;
            return (
                <span className="flex items-center gap-2">
                    <span>Checked report datasets</span>
                    <Badge variant="secondary">{totalEnqueued} enqueued</Badge>
                    <Badge variant="outline">Daily {dailyEnqueued}</Badge>
                    <Badge variant="outline">Hourly {hourlyEnqueued}</Badge>
                </span>
            );
        }
        case 'report-dataset-enqueue-summary': {
            const accountsEnqueued = typeof action.accountsEnqueued === 'number' ? action.accountsEnqueued : 0;
            return (
                <span className="flex items-center gap-2">
                    <span>Queued report datasets</span>
                    <Badge variant="secondary">{accountsEnqueued} accounts</Badge>
                </span>
            );
        }
        case 'report-dataset-cleanup': {
            const deletedCount = typeof action.deletedCount === 'number' ? action.deletedCount : 0;
            const aggregation = typeof action.aggregation === 'string' ? action.aggregation : 'report';
            const cutoff = typeof action.cutoff === 'string' ? action.cutoff : undefined;
            return (
                <span className="flex items-center gap-2">
                    <span>Cleaned {aggregation} missing datasets</span>
                    <Badge variant="secondary">{deletedCount} removed</Badge>
                    {cutoff && <Badge variant="outline">older than {formatActionTimestamp(cutoff)}</Badge>}
                </span>
            );
        }
        case 'report-dataset-backfill': {
            const insertedCount = typeof action.insertedCount === 'number' ? action.insertedCount : 0;
            const totalPeriods = typeof action.totalPeriods === 'number' ? action.totalPeriods : 0;
            const aggregation = typeof action.aggregation === 'string' ? action.aggregation : 'report';
            const windowStart = typeof action.windowStart === 'string' ? action.windowStart : undefined;
            const windowEnd = typeof action.windowEnd === 'string' ? action.windowEnd : undefined;
            return (
                <span className="flex flex-wrap items-center gap-2">
                    <span>Backfilled {aggregation} datasets</span>
                    <Badge variant="secondary">{insertedCount} added</Badge>
                    <Badge variant="outline">{totalPeriods} checked</Badge>
                    {windowStart && windowEnd && (
                        <Badge variant="outline">
                            {formatActionTimestamp(windowStart)} -> {formatActionTimestamp(windowEnd)}
                        </Badge>
                    )}
                </span>
            );
        }
        case 'enqueue-report-dataset-for-account': {
            const input = typeof action.input === 'object' && action.input ? (action.input as Record<string, unknown>) : {};
            const accountId = typeof input.accountId === 'string' ? input.accountId : undefined;
            const countryCode = typeof input.countryCode === 'string' ? input.countryCode : undefined;
            return (
                <span className="flex items-center gap-2">
                    <span>Queued account dataset refresh</span>
                    {accountId && countryCode && <Badge variant="outline">{formatAccountTag(accountId, countryCode)}</Badge>}
                </span>
            );
        }
        case 'ams-summary-enqueue': {
            const cadence = typeof action.cadence === 'string' ? action.cadence : 'ams';
            const accountsEnqueued = typeof action.accountsEnqueued === 'number' ? action.accountsEnqueued : 0;
            return (
                <span className="flex items-center gap-2">
                    <span>Queued {cadence} AMS summaries</span>
                    <Badge variant="secondary">{accountsEnqueued} accounts</Badge>
                </span>
            );
        }
        case 'ams-summary-complete': {
            const cadence = typeof action.cadence === 'string' ? action.cadence : 'ams';
            const rowsInserted = typeof action.rowsInserted === 'number' ? action.rowsInserted : 0;
            const bucketDate = typeof action.bucketDate === 'string' ? action.bucketDate : undefined;
            const windowStart = typeof action.windowStart === 'string' ? action.windowStart : undefined;
            const windowEnd = typeof action.windowEnd === 'string' ? action.windowEnd : undefined;
            return (
                <span className="flex flex-wrap items-center gap-2">
                    <span>Summarized {cadence} AMS data</span>
                    <Badge variant="secondary">{rowsInserted} rows</Badge>
                    {bucketDate && <Badge variant="outline">{bucketDate}</Badge>}
                    {windowStart && windowEnd && (
                        <Badge variant="outline">
                            {formatActionTimestamp(windowStart)} -> {formatActionTimestamp(windowEnd)}
                        </Badge>
                    )}
                </span>
            );
        }
        case 'ams-summary-skipped': {
            const cadence = typeof action.cadence === 'string' ? action.cadence : 'ams';
            const reason = typeof action.reason === 'string' ? action.reason : 'skipped';
            return (
                <span className="flex items-center gap-2">
                    <span>Skipped {cadence} AMS summary</span>
                    <Badge variant="outline">{reason}</Badge>
                </span>
            );
        }
        case 'exports-created': {
            const exportsRecord = typeof action.exports === 'object' && action.exports ? (action.exports as Record<string, unknown>) : {};
            const exportIds = Object.values(exportsRecord).filter(value => typeof value === 'string') as string[];
            return (
                <span className="flex flex-wrap items-center gap-2">
                    <span>Created exports</span>
                    {exportIds.map(exportId => (
                        <Badge key={exportId} variant="outline">
                            {exportId}
                        </Badge>
                    ))}
                </span>
            );
        }
        case 'export-failed': {
            const entityType = typeof action.entityType === 'string' ? action.entityType : 'entity';
            const error = typeof action.error === 'string' ? action.error : 'Unknown error';
            return (
                <span className="flex items-center gap-2">
                    <span>Export failed ({entityType})</span>
                    <Badge variant="outline">{error}</Badge>
                </span>
            );
        }
        case 'entities-synced': {
            const totals = typeof action.totals === 'object' && action.totals ? (action.totals as Record<string, unknown>) : {};
            const totalRecords = typeof action.totalRecords === 'number' ? action.totalRecords : 0;
            return (
                <span className="flex flex-wrap items-center gap-2">
                    <span>Synced entities</span>
                    <Badge variant="secondary">{totalRecords} rows</Badge>
                    {Object.entries(totals).map(([key, value]) => (
                        <Badge key={key} variant="outline">
                            {key}: {value as number}
                        </Badge>
                    ))}
                </span>
            );
        }
        case 'cleanup-ams-metrics': {
            const cutoff = typeof action.cutoff === 'string' ? action.cutoff : undefined;
            return (
                <span className="flex items-center gap-2">
                    <span>Cleaned AMS metrics</span>
                    {cutoff && <Badge variant="outline">cutoff {formatActionTimestamp(cutoff)}</Badge>}
                </span>
            );
        }
        default:
            return <span>{actionType}</span>;
    }
};

type TimelineRow =
    | {
          id: string;
          isSession: true;
          session: JobSession;
          action?: undefined;
      }
    | {
          id: string;
          isSession: false;
          session: JobSession;
          action: JobAction;
      };

export function JobSessionsFeed() {
    const accountId = useAtomValue(selectedAccountIdAtom);
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    const hasSelection = Boolean(accountId && countryCode);

    const { data, isLoading, isFetching, error } = useJobSessions({
        limit: 20,
        accountId: accountId || undefined,
        countryCode: countryCode || undefined,
        enabled: hasSelection,
    });
    const [selectedRow, setSelectedRow] = useState<TimelineRow | null>(null);

    const sessions = data ?? [];
    const timelineRows = useMemo(() => {
        return sessions.flatMap(session => {
            const actions = Array.isArray(session.actions) ? (session.actions as JobAction[]) : [];
            actions.sort((left, right) => {
                const leftAt = typeof left.at === 'string' ? new Date(left.at).getTime() : 0;
                const rightAt = typeof right.at === 'string' ? new Date(right.at).getTime() : 0;
                return leftAt - rightAt;
            });

            const rows: TimelineRow[] = [{ id: session.id, isSession: true, session }];
            actions.forEach((action, index) => {
                rows.push({
                    id: `${session.id}-action-${index}`,
                    isSession: false,
                    session,
                    action,
                });
            });
            return rows;
        });
    }, [sessions]);

    const handleSelect = (row: TimelineRow) => {
        setSelectedRow(row);
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
                        Select an account to view job actions.
                    </div>
                ) : isLoading || isFetching ? (
                    <div className="flex items-center justify-center py-12">
                        <Spinner className="size-6 text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-3 rounded-lg border border-red-400/40 bg-red-100/60 px-4 py-3 font-mono text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100">
                        <HugeiconsIcon icon={AlertCircleIcon} size={16} color="currentColor" />
                        <span>Failed to load job actions. {error instanceof Error ? error.message : 'Unknown error'}.</span>
                    </div>
                ) : timelineRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-muted px-4 py-6 text-center font-mono text-xs text-muted-foreground">No job actions recorded yet.</div>
                ) : (
                    <div className="relative">
                        <span className="pointer-events-none absolute left-6 top-0 h-full w-px bg-muted-foreground/30" aria-hidden />
                        <ul className="space-y-1">
                            {timelineRows.map(row => (
                                <SessionRow key={row.id} row={row} onSelect={handleSelect} />
                            ))}
                        </ul>
                    </div>
                )}
            </Card>

            <Dialog open={Boolean(selectedRow)} onOpenChange={(open: boolean) => !open && setSelectedRow(null)}>
                <DialogPopup className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-base tracking-wide">{selectedRow ? formatRowHeadline(selectedRow) : 'Job Activity'}</DialogTitle>
                        <DialogDescription className="font-mono text-xs uppercase tracking-[0.3em]">Full payload for this job activity.</DialogDescription>
                    </DialogHeader>
                    {selectedRow && (
                        <DialogPanel className="space-y-6 font-mono text-sm">
                            <div className="grid gap-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                                <div className="flex items-center justify-between">
                                    <span>{selectedRow.session.jobName}</span>
                                    <span>{formatTimestamp(getRowTimestamp(selectedRow)).absolute}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[11px]">
                                    {selectedRow.isSession && selectedRow.session.status && <Tag>{selectedRow.session.status}</Tag>}
                                    {selectedRow.isSession && selectedRow.session.error && <Tag>error</Tag>}
                                    {!selectedRow.isSession && selectedRow.action && getActionType(selectedRow.action) && <Tag>{getActionType(selectedRow.action)}</Tag>}
                                </div>
                            </div>
                            <div className="rounded-xl border border-muted bg-muted/40 p-4 text-xs text-muted-foreground">
                                <pre className="max-h-[55vh] overflow-auto">
                                    <code>{JSON.stringify(selectedRow.isSession ? selectedRow.session : selectedRow.action, null, 2)}</code>
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

const formatRowHeadline = (row: TimelineRow) => {
    if (row.isSession) {
        return getSessionHeadline(row.session);
    }
    return getActionType(row.action);
};

const getRowTimestamp = (row: TimelineRow) => {
    if (row.isSession) {
        return row.session.startedAt;
    }
    return getActionTimestamp(row.action, row.session);
};

const SessionRow = ({ row, onSelect }: { row: TimelineRow; onSelect: (row: TimelineRow) => void }) => {
    const { session, isSession } = row;
    const timestamp = formatTimestamp(getRowTimestamp(row));
    const marker = isSession ? getSessionMarker(session.status) : getActionMarker(getActionType(row.action));
    const accountTag = isSession ? getSessionAccountTag(session) : null;

    return (
        <li
            className={cn(
                'flex cursor-pointer items-center gap-2 rounded pl-10 pr-3 font-mono text-[13px] hover:bg-muted/40',
                isSession ? 'text-foreground font-semibold' : 'text-muted-foreground pl-14'
            )}
            onClick={() => onSelect(row)}
        >
            <span
                className={cn(
                    'mr-1 flex size-5 -translate-x-5 items-center justify-center rounded-full border bg-background text-[10px]',
                    !isSession && '-translate-x-9',
                    marker.className
                )}
            >
                <HugeiconsIcon icon={marker.icon} size={14} color="currentColor" />
            </span>
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {timestamp.absolute}
                <span className="text-muted-foreground/40">-</span>
                <span className="text-emerald-600 dark:text-emerald-300">{timestamp.relativeShort}</span>
            </span>
            <span className={cn('truncate', !isSession ? 'font-normal text-foreground' : '')}>
                {isSession ? getSessionHeadline(session) : renderActionContent(row.action)}
            </span>
            {isSession && accountTag && <Tag>{accountTag}</Tag>}
            {isSession && session.status && <Tag>{session.status}</Tag>}
        </li>
    );
};

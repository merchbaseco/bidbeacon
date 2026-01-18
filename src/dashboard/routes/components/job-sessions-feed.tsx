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

const Tag = ({ children, variant = 'outline' }: { children: ReactNode; variant?: 'outline' | 'secondary' }) => (
    <Badge variant={variant} className="text-[11px] font-medium">
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
            if (timestamp) {
                return `Queued report status · ${formatReportTimestamp(timestamp, aggregation)}`;
            }
            return 'Queued report status';
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
            if (timestamp) {
                return `${label} · ${formatReportTimestamp(timestamp, aggregation)}`;
            }
            return label;
        }
        case 'report-dataset-scan': {
            const totalEnqueued = typeof action.totalEnqueuedCount === 'number' ? action.totalEnqueuedCount : 0;
            return `Checked datasets · ${totalEnqueued} enqueued`;
        }
        case 'report-dataset-enqueue-summary': {
            const accountsEnqueued = typeof action.accountsEnqueued === 'number' ? action.accountsEnqueued : 0;
            return `Queued report datasets · ${accountsEnqueued} accounts`;
        }
        case 'report-dataset-cleanup': {
            const deletedCount = typeof action.deletedCount === 'number' ? action.deletedCount : 0;
            const aggregation = typeof action.aggregation === 'string' ? action.aggregation : 'report';
            return `Cleaned ${aggregation} datasets · ${deletedCount} removed`;
        }
        case 'report-dataset-backfill': {
            const insertedCount = typeof action.insertedCount === 'number' ? action.insertedCount : 0;
            const aggregation = typeof action.aggregation === 'string' ? action.aggregation : 'report';
            return `Backfilled ${aggregation} datasets · ${insertedCount} added`;
        }
        case 'enqueue-report-dataset-for-account': {
            const input = typeof action.input === 'object' && action.input ? (action.input as Record<string, unknown>) : {};
            const accountId = typeof input.accountId === 'string' ? input.accountId : undefined;
            const countryCode = typeof input.countryCode === 'string' ? input.countryCode : undefined;
            if (accountId && countryCode) {
                return `Queued dataset refresh · ${formatAccountTag(accountId, countryCode)}`;
            }
            return 'Queued dataset refresh';
        }
        case 'ams-summary-enqueue': {
            const cadence = typeof action.cadence === 'string' ? action.cadence : 'ams';
            const accountsEnqueued = typeof action.accountsEnqueued === 'number' ? action.accountsEnqueued : 0;
            return `Queued ${cadence} summaries · ${accountsEnqueued} accounts`;
        }
        case 'ams-summary-complete': {
            const cadence = typeof action.cadence === 'string' ? action.cadence : 'ams';
            const rowsInserted = typeof action.rowsInserted === 'number' ? action.rowsInserted : 0;
            const bucketDate = typeof action.bucketDate === 'string' ? action.bucketDate : undefined;
            if (bucketDate) {
                return `Summarized ${cadence} data · ${rowsInserted} rows · ${bucketDate}`;
            }
            return `Summarized ${cadence} data · ${rowsInserted} rows`;
        }
        case 'ams-summary-skipped': {
            const cadence = typeof action.cadence === 'string' ? action.cadence : 'ams';
            const reason = typeof action.reason === 'string' ? action.reason : 'skipped';
            return `Skipped ${cadence} summary · ${reason}`;
        }
        case 'exports-created': {
            const exportsRecord = typeof action.exports === 'object' && action.exports ? (action.exports as Record<string, unknown>) : {};
            const exportCount = Object.keys(exportsRecord).length;
            return `Created ${exportCount} export${exportCount !== 1 ? 's' : ''}`;
        }
        case 'export-failed': {
            const entityType = typeof action.entityType === 'string' ? action.entityType : 'entity';
            return `Export failed · ${entityType}`;
        }
        case 'entities-synced': {
            const totalRecords = typeof action.totalRecords === 'number' ? action.totalRecords : 0;
            return `Synced entities · ${totalRecords} rows`;
        }
        case 'cleanup-ams-metrics': {
            const cutoff = typeof action.cutoff === 'string' ? action.cutoff : undefined;
            if (cutoff) {
                return `Cleaned AMS metrics · before ${formatActionTimestamp(cutoff)}`;
            }
            return 'Cleaned AMS metrics';
        }
        default:
            return actionType;
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
            <Card className="p-3 space-y-0 gap-0">
                <div className="flex items-center justify-between pb-2 px-1">
                    <h3 className="text-sm font-medium">Event Stream</h3>
                </div>
                {!hasSelection ? (
                    <div className="flex items-center justify-center py-12">
                        <p className="text-sm text-muted-foreground">Select an account to view events</p>
                    </div>
                ) : isLoading || isFetching ? (
                    <div className="flex items-center justify-center py-12">
                        <Spinner className="size-5 text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground">Unable to load events</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">{error instanceof Error ? error.message : 'Please try again later'}</p>
                        </div>
                    </div>
                ) : timelineRows.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <p className="text-sm text-muted-foreground">No events recorded yet</p>
                    </div>
                ) : (
                    <ul className="px-1">
                        {timelineRows.map(row => (
                            <SessionRow key={row.id} row={row} onSelect={handleSelect} />
                        ))}
                    </ul>
                )}
            </Card>

            <Dialog open={Boolean(selectedRow)} onOpenChange={(open: boolean) => !open && setSelectedRow(null)}>
                <DialogPopup className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{selectedRow ? formatRowHeadline(selectedRow) : 'Job Activity'}</DialogTitle>
                        <DialogDescription>Event details and payload</DialogDescription>
                    </DialogHeader>
                    {selectedRow && (
                        <DialogPanel className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-mono text-muted-foreground">{selectedRow.session.jobName}</span>
                                <span className="text-muted-foreground">{formatTimestamp(getRowTimestamp(selectedRow)).absolute}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {selectedRow.isSession && selectedRow.session.status && <Tag variant="secondary">{selectedRow.session.status}</Tag>}
                                {selectedRow.isSession && selectedRow.session.error && <Tag>error</Tag>}
                                {!selectedRow.isSession && selectedRow.action && getActionType(selectedRow.action) && <Tag>{getActionType(selectedRow.action)}</Tag>}
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-3">
                                <pre className="max-h-[50vh] overflow-auto text-xs font-mono text-muted-foreground">
                                    <code>{JSON.stringify(selectedRow.isSession ? selectedRow.session : selectedRow.action, null, 2)}</code>
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

    if (isSession) {
        return (
            <li
                className="group flex cursor-pointer gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                onClick={() => onSelect(row)}
            >
                <div className="flex flex-col items-center pt-0.5">
                    <span
                        className={cn(
                            'flex size-6 items-center justify-center rounded-full border-2 bg-background',
                            marker.className
                        )}
                    >
                        <HugeiconsIcon icon={marker.icon} size={14} color="currentColor" />
                    </span>
                    <span className="mt-1.5 w-px flex-1 bg-border group-last:hidden" />
                </div>
                <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground">
                            {getSessionHeadline(session)}
                        </span>
                        {accountTag && <Tag>{accountTag}</Tag>}
                        {session.status && (
                            <Tag variant={session.status === 'succeeded' ? 'secondary' : 'outline'}>
                                {session.status}
                            </Tag>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <span>{timestamp.absolute}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{timestamp.relativeShort}</span>
                    </div>
                </div>
            </li>
        );
    }

    return (
        <li
            className="group flex cursor-pointer gap-3 rounded-lg px-3 py-1 hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(row)}
        >
            <div className="flex flex-col items-center">
                <span className="w-px h-1 bg-border" />
                <span
                    className={cn(
                        'flex size-5 items-center justify-center rounded-full border bg-background',
                        marker.className
                    )}
                >
                    <HugeiconsIcon icon={marker.icon} size={12} color="currentColor" />
                </span>
                <span className="mt-1 w-px flex-1 bg-border group-last:hidden" />
            </div>
            <div className="flex-1 min-w-0 py-0.5">
                <div className="text-sm text-muted-foreground">
                    {renderActionContent(row.action)}
                </div>
            </div>
        </li>
    );
};

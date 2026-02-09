import { HugeiconsIcon } from '@hugeicons/react';
import AlarmClockIcon from '@merchbaseco/icons/core-solid-rounded/AlarmClockIcon';
import ChartColumnIcon from '@merchbaseco/icons/core-solid-rounded/ChartColumnIcon';
import Clock05Icon from '@merchbaseco/icons/core-solid-rounded/Clock05Icon';
import TimeScheduleIcon from '@merchbaseco/icons/core-solid-rounded/TimeScheduleIcon';
import { useMemo } from 'react';
import { Progress } from '@/dashboard/components/ui/progress.js';
import { Spinner } from '@/dashboard/components/ui/spinner.js';
import { Badge } from '../../../components/ui/badge.js';
import { TableCell, TableRow } from '../../../components/ui/table.js';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../../../components/ui/tooltip.js';
import { useReport } from '../../hooks/use-report.js';
import type { ReportSummary } from '../../hooks/use-reports.js';
import { useSelectedAccountId } from '../../hooks/use-selected-accountid.js';
import { formatDate } from '../../utils.js';
import { ErrorDialog } from './error-dialog.js';
import { ReportIdDialog } from './report-id-dialog.js';
import { ReportRefreshButton } from './report-refresh-button.js';

interface ReportRowProps {
    summary: ReportSummary;
}

const getStatusBadgeType = (status: string) => {
    switch (status) {
        case 'completed':
            return 'outline';
        case 'error':
            return 'error';
        case 'fetching':
            return 'info';
        case 'parsing':
            return 'warning';
        case 'missing':
            return 'outline';
        default:
            return 'outline';
    }
};

const getStatusColor = (status: string) => {
    switch (status) {
        case 'completed':
            return 'bg-emerald-500';
        case 'error':
            return 'bg-destructive';
        case 'fetching':
            return 'bg-info';
        case 'parsing':
            return 'bg-warning';
        case 'missing':
            return 'bg-muted-foreground/50';
        default:
            return 'bg-muted-foreground/50';
    }
};

export const ReportRow = ({ summary }: ReportRowProps) => {
    const accountId = useSelectedAccountId();
    const { report, isLoading } = useReport({ uid: summary.uid });

    const statusBadgeType = useMemo(() => getStatusBadgeType(report?.status ?? ''), [report?.status]);
    const statusColor = useMemo(() => getStatusColor(report?.status ?? ''), [report?.status]);

    if (isLoading || !report) {
        return (
            <TableRow>
                <TableCell className="text-center text-muted-foreground" colSpan={7}>
                    Loading...
                </TableCell>
            </TableRow>
        );
    }

    const rowKey = `${report.periodStart}-${report.aggregation}-${report.entityType}`;

    const reportDate = formatDate(summary.periodStart, summary.aggregation === 'hourly');
    const isParsingStatus = report.status === 'parsing';
    const isRefreshing = report.refreshing;
    const { time: nextRefreshTime, severity: nextRefreshSeverity } = formatNextRefreshTime(report.nextRefreshAt);

    return (
        <TableRow key={rowKey}>
            <TableCell className="pl-4">
                <div className="flex items-center gap-2">
                    <Badge className="uppercase" variant="info">
                        {report.aggregation}
                    </Badge>
                    <Badge className="uppercase" variant="info">
                        {report.entityType}
                    </Badge>
                    <span className="font-medium">{reportDate}</span>
                </div>
            </TableCell>
            <TableCell>
                {isParsingStatus ? (
                    <Badge className="gap-0" variant="secondary">
                        <Spinner className="size-3" />
                        &nbsp;
                        <Progress className="w-16" value={((report.successRecords + report.errorRecords) / report.totalRecords) * 100} />
                    </Badge>
                ) : isRefreshing ? (
                    <Badge className="gap-1.5" variant="secondary">
                        <Spinner className="size-3" />
                        Refreshing
                    </Badge>
                ) : (
                    <ErrorDialog row={report}>
                        <Badge className="flex items-center gap-1 uppercase" variant={statusBadgeType}>
                            <span className={`size-1.5 rounded-full ${statusColor}`} />
                            {report.status}
                        </Badge>
                    </ErrorDialog>
                )}
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5 tracking-tight">
                    {report.refreshing && (
                        <div className="flex items-center gap-1.5">
                            <HugeiconsIcon icon={TimeScheduleIcon} size={16} />
                            <span className="cursor-help">Now</span>
                        </div>
                    )}
                    {report.nextRefreshAt && !report.refreshing && (
                        <Tooltip>
                            <TooltipTrigger>
                                <div className="flex items-center gap-1.5">
                                    {nextRefreshSeverity === 'overdue' ? <HugeiconsIcon className="-ml-px" icon={AlarmClockIcon} size={18} /> : <HugeiconsIcon icon={Clock05Icon} size={16} />}
                                    <span className={`cursor-help ${nextRefreshSeverity !== 'overdue' ? 'text-muted-foreground' : ''}`}>{nextRefreshTime}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipPopup>{formatDate(report.nextRefreshAt)}</TooltipPopup>
                        </Tooltip>
                    )}
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={ChartColumnIcon} size={16} />
                    {report.totalRecords}
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={ChartColumnIcon} size={16} />
                    {report.errorRecords}
                </div>
            </TableCell>
            <TableCell>{report.reportId ? <ReportIdDialog accountId={accountId} row={report} /> : ''}</TableCell>
            <TableCell className="text-right">
                <ReportRefreshButton accountId={accountId} row={report} />
            </TableCell>
        </TableRow>
    );
};

/**
 * Format a date as a compact relative time (e.g., "6hr 15min", "2d")
 * Returns "Overdue" if the date is in the past
 */
const formatNextRefreshTime = (
    input: string | null
): {
    time: string;
    severity: 'overdue' | 'soon' | 'later';
} => {
    if (!input) {
        return {
            time: 'Later',
            severity: 'later',
        };
    }

    const date = new Date(input);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const remainingMinutes = diffMinutes % 60;

    // For past dates, show "Overdue"
    if (diffMs < 0) {
        return {
            time: 'Overdue',
            severity: 'overdue',
        };
    }

    // For future dates, format as compact "6hr 15min" style
    const parts: string[] = [];

    if (diffDays > 0) {
        parts.push(`${diffDays}d`);
    } else if (diffHours > 0) {
        parts.push(`${diffHours}hr`);
        if (remainingMinutes > 0) {
            parts.push(`${remainingMinutes}min`);
        }
    } else if (diffMinutes > 0) {
        parts.push(`${diffMinutes}min`);
    } else {
        return {
            time: 'now',
            severity: 'soon',
        };
    }

    return {
        time: parts.join(' '),
        severity: diffDays > 0 || diffHours > 0 ? 'later' : 'soon',
    };
};

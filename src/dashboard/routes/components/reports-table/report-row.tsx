import { HugeiconsIcon } from '@hugeicons/react';
import Clock05Icon from '@merchbaseco/icons/core-solid-rounded/Clock05Icon';
import { Progress } from '@/dashboard/components/ui/progress.js';
import { Spinner } from '@/dashboard/components/ui/spinner.js';
import { cn } from '@/dashboard/lib/utils.js';
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

export const ReportRow = ({ summary }: ReportRowProps) => {
    const accountId = useSelectedAccountId();
    const { report, isLoading } = useReport({ uid: summary.uid });

    if (isLoading || !report) {
        return (
            <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Loading...
                </TableCell>
            </TableRow>
        );
    }

    const rowKey = `${report.periodStart}-${report.aggregation}-${report.entityType}`;

    const reportDate = formatDate(summary.periodStart, summary.aggregation === 'hourly');
    const statusBadgeType = report.status === 'completed' ? 'success' : 'warning';
    const isParsingStatus = report.status === 'fetching';
    const { time: nextRefreshTime, severity: nextRefreshSeverity } = formatNextRefreshTime(report.nextRefreshAt);

    return (
        <TableRow key={rowKey}>
            <TableCell className="pl-4">
                <div className="flex items-center gap-2">
                    <Badge variant="info" className="uppercase">
                        {report.aggregation}
                    </Badge>
                    <Badge variant="info" className="uppercase">
                        {report.entityType}
                    </Badge>
                    <span className="font-medium">{reportDate}</span>
                </div>
            </TableCell>
            <TableCell>
                {isParsingStatus ? (
                    <Badge variant="secondary" className="gap-0">
                        <Spinner className="size-3" />
                        &nbsp;
                        <Progress className="w-16" value={24} />
                    </Badge>
                ) : (
                    <ErrorDialog row={report}>
                        <Badge variant={statusBadgeType} className="uppercase">
                            {report.status}
                        </Badge>
                    </ErrorDialog>
                )}
            </TableCell>
            <TableCell>
                <div
                    className={cn(
                        'flex items-center gap-1.5 tracking-tight',
                        report.nextRefreshAt && (nextRefreshSeverity === 'overdue' ? 'text-red-400' : nextRefreshSeverity === 'soon' ? 'text-orange-400' : 'text-foreground')
                    )}
                >
                    <HugeiconsIcon icon={Clock05Icon} size={16} />

                    {report.nextRefreshAt ? (
                        <Tooltip>
                            <TooltipTrigger>
                                <span className="cursor-help">{nextRefreshTime}</span>
                            </TooltipTrigger>
                            <TooltipPopup>{formatDate(report.nextRefreshAt)}</TooltipPopup>
                        </Tooltip>
                    ) : (
                        '—'
                    )}
                </div>
            </TableCell>
            <TableCell>{report.reportId ? <ReportIdDialog row={report} accountId={accountId} /> : <Badge variant="outline">—</Badge>}</TableCell>
            <TableCell className="text-right">
                <ReportRefreshButton row={report} accountId={accountId} />
            </TableCell>
        </TableRow>
    );
};

/**
 * Format a date as a natural relative time (e.g., "in 2 hours", "in 3 days", "in 5 minutes")
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

    // For past dates, show "Overdue"
    if (diffMs < 0) {
        return {
            time: 'Overdue',
            severity: 'overdue',
        };
    }

    // For future dates, show as "in X days" or "in X hours"
    if (diffDays > 0) {
        return {
            time: `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
            severity: 'later',
        };
    }

    if (diffHours > 0) {
        return {
            time: `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}`,
            severity: 'later',
        };
    }

    if (diffMinutes > 0) {
        return {
            time: `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'}`,
            severity: 'soon',
        };
    }

    return {
        time: 'now',
        severity: 'soon',
    };
};

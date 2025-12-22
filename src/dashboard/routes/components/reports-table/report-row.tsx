import { Badge } from '../../../components/ui/badge.js';
import { TableCell, TableRow } from '../../../components/ui/table.js';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../../../components/ui/tooltip.js';
import { api } from '../../../lib/trpc.js';
import { useSelectedAccountId } from '../../hooks/use-selected-accountid.js';
import { useWebSocketEvents } from '../../hooks/use-websocket-events.js';
import { formatDate, formatRelativeTime } from '../../utils.js';
import { StatusBadge } from '../status-badge.js';
import { ErrorDialog } from './error-dialog.js';
import { ReportIdDialog } from './report-id-dialog.js';
import { ReportRefreshButton } from './report-refresh-button.js';
import type { ReportSummary } from '../../hooks/use-report-datasets.js';

interface ReportRowProps {
    summary: ReportSummary;
}

export const ReportRow = ({ summary }: ReportRowProps) => {
    const accountId = useSelectedAccountId();
    const apiUtils = api.useUtils();
    const { data: report, isLoading } = api.reports.get.useQuery(
        { uid: summary.uid },
        {
            enabled: !!summary.uid,
        }
    );

    // Invalidate this specific report when it's refreshed
    useWebSocketEvents('report:refreshed', event => {
        if (event.row.uid === summary.uid) {
            apiUtils.reports.get.invalidate({ uid: summary.uid });
        }
    });

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

    return (
        <TableRow key={rowKey}>
            <TableCell className="font-medium">{formatDate(report.periodStart)}</TableCell>
            <TableCell>
                <Badge variant="outline">{report.aggregation}</Badge>
            </TableCell>
            <TableCell>
                <Badge variant="secondary">{report.entityType}</Badge>
            </TableCell>
            <TableCell>{report.error ? <ErrorDialog row={report} /> : <StatusBadge status={report.status} />}</TableCell>
            <TableCell>
                {report.nextRefreshAt ? (
                    <Tooltip>
                        <TooltipTrigger>
                            <span className="cursor-help">{formatRelativeTime(report.nextRefreshAt)}</span>
                        </TooltipTrigger>
                        <TooltipPopup>{formatDate(report.nextRefreshAt)}</TooltipPopup>
                    </Tooltip>
                ) : (
                    '—'
                )}
            </TableCell>
            <TableCell>{report.reportId ? <ReportIdDialog row={report} accountId={accountId} /> : <Badge variant="outline">—</Badge>}</TableCell>
            <TableCell className="text-right">
                <ReportRefreshButton row={report} accountId={accountId} />
            </TableCell>
        </TableRow>
    );
};


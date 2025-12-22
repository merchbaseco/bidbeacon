import { useAtom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { Badge } from '../../../components/ui/badge.js';
import { ButtonGroupSeparator } from '../../../components/ui/button-group.js';
import { Frame, FrameFooter } from '../../../components/ui/frame.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.js';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../../../components/ui/tooltip.js';
import { useReportDatasets } from '../../hooks/use-report-datasets.js';
import { useSelectedAccountId } from '../../hooks/use-selected-accountid.js';
import { formatDate, formatRelativeTime } from '../../utils.js';
import { StatusBadge } from '../status-badge.js';
import { limitAtom, offsetAtom } from './atoms.js';
import { EntityAggregationFilter } from './entity-aggregation-filter.js';
import { EntityTypeFilter } from './entity-type-filter.js';
import { ErrorDialog } from './error-dialog.js';
import { RefreshButton } from './refresh-button.js';
import { ReportIdDialog } from './report-id-dialog.js';
import { ReportRefreshButton } from './report-refresh-button.js';
import { StatusFilter } from './status-filter.js';
import { TablePagination } from './table-pagination.js';
import { TableResultsRange } from './table-results-range.js';

export const ReportsTable = () => {
    const limit = useAtomValue(limitAtom);
    const [offset, setOffset] = useAtom(offsetAtom);
    const { data: rows = [], total, isLoading } = useReportDatasets();
    const accountId = useSelectedAccountId();

    // Calculate current page from offset/limit for pagination components
    const currentPage = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
    const totalPages = useMemo(() => Math.ceil(total / limit), [total, limit]);

    const handlePageChange = (page: number) => {
        setOffset((page - 1) * limit);
    };

    return (
        <>
            <div className="mb-4 flex items-center gap-2">
                <EntityAggregationFilter />
                <ButtonGroupSeparator />
                <EntityTypeFilter />
                <ButtonGroupSeparator />
                <StatusFilter />
                <RefreshButton />
            </div>
            <Frame className="w-full">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Period Start</TableHead>
                            <TableHead>Aggregation</TableHead>
                            <TableHead>Entity Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Next refresh</TableHead>
                            <TableHead>Report ID</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && !isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    No records found in this window.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map(row => {
                                const rowKey = `${row.periodStart}-${row.aggregation}-${row.entityType}`;

                                return (
                                    <TableRow key={rowKey}>
                                        <TableCell className="font-medium">{formatDate(row.periodStart)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{row.aggregation}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{row.entityType}</Badge>
                                        </TableCell>
                                        <TableCell>{row.error ? <ErrorDialog row={row} /> : <StatusBadge status={row.status} />}</TableCell>
                                        <TableCell>
                                            {row.nextRefreshAt ? (
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <span className="cursor-help">{formatRelativeTime(row.nextRefreshAt)}</span>
                                                    </TooltipTrigger>
                                                    <TooltipPopup>{formatDate(row.nextRefreshAt)}</TooltipPopup>
                                                </Tooltip>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                        <TableCell>{row.reportId ? <ReportIdDialog row={row} accountId={accountId} /> : <Badge variant="outline">—</Badge>}</TableCell>
                                        <TableCell className="text-right">
                                            <ReportRefreshButton row={row} accountId={accountId} />
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
                {total > 0 && (
                    <FrameFooter className="p-2">
                        <div className="flex items-center justify-between gap-2">
                            <TableResultsRange currentPage={currentPage} totalPages={totalPages} pageSize={limit} totalResults={total} onPageChange={handlePageChange} />
                            {totalPages > 1 && <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />}
                        </div>
                    </FrameFooter>
                )}
            </Frame>
        </>
    );
};

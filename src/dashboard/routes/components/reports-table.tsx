import { HugeiconsIcon } from '@hugeicons/react';
import CircleArrowReload01Icon from '@merchbaseco/icons/core-solid-rounded/CircleArrowReload01Icon';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Frame, FrameFooter } from '../../components/ui/frame';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useRefreshReportsTable } from '../hooks/use-refresh-reports-table.js';
import { useReportDatasets } from '../hooks/use-report-datasets.js';
import { useReprocess } from '../hooks/use-reprocess.js';
import { useSelectedAccountId } from '../hooks/use-selected-accountid.js';
import { formatDate } from '../utils.js';
import { ReportsToolbar } from './reports-toolbar.js';
import { StatusBadge } from './status-badge.js';
import { TablePagination } from './table-pagination.js';
import { TableResultsRange } from './table-results-range.js';

const ITEMS_PER_PAGE = 10;

export const ReportsTable = () => {
    const [aggregation, setAggregation] = useState<'daily' | 'hourly'>('daily');
    const { data: rows = [], isLoading } = useReportDatasets(aggregation);
    const accountId = useSelectedAccountId();

    const { reprocessAt, pending } = useReprocess(accountId, aggregation);
    const { refreshReportsTable, pending: refreshPending } = useRefreshReportsTable(accountId);

    const [currentPage, setCurrentPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Filter rows by status
    const filteredRows = useMemo(() => {
        if (statusFilter === 'all') {
            return rows;
        }
        return rows.filter(row => row.status === statusFilter);
    }, [rows, statusFilter]);

    const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedRows = filteredRows.slice(startIndex, endIndex);

    // Adjust current page if it exceeds total pages
    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(totalPages);
        } else if (totalPages === 0 && currentPage !== 1) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    const handleAggregationChange = (value: 'daily' | 'hourly') => {
        setAggregation(value);
        setCurrentPage(1);
    };

    const handleStatusFilterChange = (value: string) => {
        setStatusFilter(value);
        setCurrentPage(1);
    };

    const handleRefresh = () => {
        refreshReportsTable();
    };

    return (
        <>
            <ReportsToolbar
                aggregation={aggregation}
                statusFilter={statusFilter}
                isLoading={isLoading || refreshPending}
                onAggregationChange={handleAggregationChange}
                onStatusFilterChange={handleStatusFilterChange}
                onRefresh={handleRefresh}
            />
            <Frame className="w-full">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Timestamp</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last refreshed</TableHead>
                            <TableHead>Report ID</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    No records found in this window.
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedRows.map(row => (
                                <TableRow key={`${row.timestamp}-${row.aggregation}`}>
                                    <TableCell className="font-medium">{formatDate(row.timestamp)}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={row.status} />
                                    </TableCell>
                                    <TableCell>{row.lastRefreshed ? formatDate(row.lastRefreshed) : '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{row.reportId}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="secondary" type="button" disabled={pending !== null} onClick={() => reprocessAt(row.timestamp)} className="inline-flex items-center gap-2">
                                            <HugeiconsIcon icon={CircleArrowReload01Icon} size={16} color="currentColor" />
                                            {pending === row.timestamp ? 'Queuing…' : 'Reprocess'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                {filteredRows.length > 0 && (
                    <FrameFooter className="p-2">
                        <div className="flex items-center justify-between gap-2">
                            <TableResultsRange currentPage={currentPage} totalPages={totalPages} pageSize={ITEMS_PER_PAGE} totalResults={filteredRows.length} onPageChange={setCurrentPage} />
                            {filteredRows.length > ITEMS_PER_PAGE && <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />}
                        </div>
                    </FrameFooter>
                )}
            </Frame>
        </>
    );
};

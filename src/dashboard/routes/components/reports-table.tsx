import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Frame, FrameFooter } from '../../components/ui/frame';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useReportDatasets } from '../hooks/use-report-datasets';
import { useSelectedAccountId } from '../hooks/use-selected-accountid';
import { formatDate, formatRelativeTime } from '../utils.js';
import { ReportIdDialog } from './report-id-dialog.js';
import { ReportRefreshButton } from './report-refresh-button.js';
import { ReportsToolbar } from './reports-toolbar.js';
import { StatusBadge } from './status-badge.js';
import { TablePagination } from './table-pagination.js';
import { TableResultsRange } from './table-results-range.js';

const ITEMS_PER_PAGE = 10;

export const ReportsTable = () => {
    const [aggregation, setAggregation] = useState<'daily' | 'hourly'>('daily');
    const [entityType, setEntityType] = useState<'target' | 'product'>('target');
    const { data: rows = [], isLoading } = useReportDatasets(aggregation);
    const accountId = useSelectedAccountId();

    const [currentPage, setCurrentPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Filter rows by status and entity type
    const filteredRows = useMemo(() => {
        let filtered = rows;

        // Filter by entity type
        filtered = filtered.filter(row => row.entityType === entityType);

        // Filter by status
        if (statusFilter !== 'all') {
            filtered = filtered.filter(row => row.status === statusFilter);
        }

        return filtered;
    }, [rows, entityType, statusFilter]);

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

    const handleEntityTypeChange = (value: 'target' | 'product') => {
        setEntityType(value);
        setCurrentPage(1);
    };

    const handleStatusFilterChange = (value: string) => {
        setStatusFilter(value);
        setCurrentPage(1);
    };

    return (
        <>
            <ReportsToolbar
                aggregation={aggregation}
                entityType={entityType}
                statusFilter={statusFilter}
                isLoading={isLoading}
                onAggregationChange={handleAggregationChange}
                onEntityTypeChange={handleEntityTypeChange}
                onStatusFilterChange={handleStatusFilterChange}
            />
            <Frame className="w-full">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Timestamp</TableHead>
                            <TableHead>Aggregation</TableHead>
                            <TableHead>Entity Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Next refresh</TableHead>
                            <TableHead>Report ID</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    No records found in this window.
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedRows.map(row => {
                                const rowKey = `${row.timestamp}-${row.aggregation}-${row.entityType}`;

                                return (
                                    <TableRow key={rowKey}>
                                        <TableCell className="font-medium">{formatDate(row.timestamp)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{row.aggregation}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{row.entityType}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={row.status} />
                                        </TableCell>
                                        <TableCell>{formatRelativeTime(row.nextRefreshAt ?? null)}</TableCell>
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

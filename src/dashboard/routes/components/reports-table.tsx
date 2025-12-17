import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Frame, FrameFooter } from '../../components/ui/frame';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { api } from '../../lib/trpc.js';
import { useRefreshReportsTable } from '../hooks/use-refresh-reports-table.js';
import { useReportDatasets } from '../hooks/use-report-datasets.js';
import { useSelectedAccountId } from '../hooks/use-selected-accountid.js';
import { formatDate } from '../utils.js';
import { ReportIdDialog } from './report-id-dialog.js';
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

    const { refreshReportsTable, pending: refreshPending } = useRefreshReportsTable(accountId);

    const refreshReportMutation = api.reports.refresh.useMutation({
        onError: error => {
            toast.error('Report refresh failed', {
                description: error.message,
            });
        },
    });

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

    const handleRefresh = () => {
        refreshReportsTable();
    };

    return (
        <>
            <ReportsToolbar
                aggregation={aggregation}
                entityType={entityType}
                statusFilter={statusFilter}
                isLoading={isLoading || refreshPending}
                onAggregationChange={handleAggregationChange}
                onEntityTypeChange={handleEntityTypeChange}
                onStatusFilterChange={handleStatusFilterChange}
                onRefresh={handleRefresh}
            />
            <Frame className="w-full">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Timestamp</TableHead>
                            <TableHead>Aggregation</TableHead>
                            <TableHead>Entity Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last refreshed</TableHead>
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
                                        <TableCell>{row.lastRefreshed ? formatDate(row.lastRefreshed) : '—'}</TableCell>
                                        <TableCell>{row.reportId ? <ReportIdDialog row={row} accountId={accountId} /> : <Badge variant="outline">—</Badge>}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="secondary"
                                                size="icon"
                                                onClick={() => {
                                                    if (!accountId || !row.countryCode) return;
                                                    refreshReportMutation.mutate({
                                                        accountId,
                                                        countryCode: row.countryCode,
                                                        timestamp: row.timestamp,
                                                        aggregation: row.aggregation,
                                                        entityType: row.entityType,
                                                    });
                                                }}
                                                disabled={row.refreshing}
                                            >
                                                <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={20} />
                                            </Button>
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

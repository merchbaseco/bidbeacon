import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Frame, FrameFooter } from '../../components/ui/frame';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { createReport, parseReport, retrieveReport } from '../hooks/api.js';
import { useRefreshReportsTable } from '../hooks/use-refresh-reports-table.js';
import { useReportDatasets } from '../hooks/use-report-datasets.js';
import { useSelectedAccountId } from '../hooks/use-selected-accountid.js';
import { formatDate } from '../utils.js';
import { ReportResponseDialog } from './report-response-dialog.js';
import { ReportsToolbar } from './reports-toolbar.js';
import { StatusBadge } from './status-badge.js';
import { TablePagination } from './table-pagination.js';
import { TableResultsRange } from './table-results-range.js';

const ITEMS_PER_PAGE = 10;

export const ReportsTable = () => {
    const [aggregation, setAggregation] = useState<'daily' | 'hourly'>('daily');
    const { data: rows = [], isLoading } = useReportDatasets(aggregation);
    const accountId = useSelectedAccountId();

    const { refreshReportsTable, pending: refreshPending } = useRefreshReportsTable(accountId);

    const [currentPage, setCurrentPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogData, setDialogData] = useState<unknown>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

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

    const handleCreateReport = async (row: (typeof rows)[0]) => {
        if (!accountId || !row.countryCode) return;

        setLoadingAction(`create-${row.timestamp}`);
        setDialogTitle('Create Report Response');
        setDialogError(null);
        setDialogData(null);

        try {
            const response = await createReport({
                accountId,
                countryCode: row.countryCode,
                timestamp: row.timestamp,
                aggregation: row.aggregation,
            });
            setDialogData(response);
            setDialogOpen(true);
        } catch (error) {
            setDialogError(error instanceof Error ? error.message : 'Unknown error');
            setDialogOpen(true);
        } finally {
            setLoadingAction(null);
        }
    };

    const handleRetrieveReport = async (row: (typeof rows)[0]) => {
        if (!accountId) return;

        setLoadingAction(`retrieve-${row.timestamp}`);
        setDialogTitle('Retrieve Report Response');
        setDialogError(null);
        setDialogData(null);

        try {
            const response = await retrieveReport({
                accountId,
                timestamp: row.timestamp,
                aggregation: row.aggregation,
            });
            setDialogData(response);
            setDialogOpen(true);
        } catch (error) {
            setDialogError(error instanceof Error ? error.message : 'Unknown error');
            setDialogOpen(true);
        } finally {
            setLoadingAction(null);
        }
    };

    const handleParseReport = async (row: (typeof rows)[0]) => {
        if (!accountId || !row.countryCode) return;

        setLoadingAction(`parse-${row.timestamp}`);
        setDialogTitle('Parse Report Response');
        setDialogError(null);
        setDialogData(null);

        try {
            const response = await parseReport({
                accountId,
                countryCode: row.countryCode,
                timestamp: row.timestamp,
                aggregation: row.aggregation,
            });
            setDialogData(response);
            setDialogOpen(true);
        } catch (error) {
            setDialogError(error instanceof Error ? error.message : 'Unknown error');
            setDialogOpen(true);
        } finally {
            setLoadingAction(null);
        }
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
                            paginatedRows.map(row => {
                                const createActionKey = `create-${row.timestamp}`;
                                const retrieveActionKey = `retrieve-${row.timestamp}`;
                                const parseActionKey = `parse-${row.timestamp}`;
                                const isCreating = loadingAction === createActionKey;
                                const isRetrieving = loadingAction === retrieveActionKey;
                                const isParsing = loadingAction === parseActionKey;
                                const isActionPending = isCreating || isRetrieving || isParsing;

                                return (
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
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="secondary"
                                                    type="button"
                                                    size="sm"
                                                    disabled={isActionPending}
                                                    onClick={() => handleCreateReport(row)}
                                                    className="inline-flex items-center gap-2"
                                                >
                                                    {isCreating ? 'Creating…' : 'Create Report'}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    type="button"
                                                    size="sm"
                                                    disabled={isActionPending || !row.reportId}
                                                    onClick={() => handleRetrieveReport(row)}
                                                    className="inline-flex items-center gap-2"
                                                >
                                                    {isRetrieving ? 'Retrieving…' : 'Retrieve Report'}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    type="button"
                                                    size="sm"
                                                    disabled={isActionPending || !row.reportId}
                                                    onClick={() => handleParseReport(row)}
                                                    className="inline-flex items-center gap-2"
                                                >
                                                    {isParsing ? 'Parsing…' : 'Parse Report'}
                                                </Button>
                                            </div>
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
            <ReportResponseDialog open={dialogOpen} onOpenChange={setDialogOpen} title={dialogTitle} data={dialogData} error={dialogError} />
        </>
    );
};

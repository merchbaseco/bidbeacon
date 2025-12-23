import { useAtom, useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { ButtonGroupSeparator } from '../../../components/ui/button-group.js';
import { Frame, FrameFooter } from '../../../components/ui/frame.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.js';
import { useReports } from '../../hooks/use-reports.js';
import { limitAtom, offsetAtom } from './atoms.js';
import { EntityAggregationFilter } from './entity-aggregation-filter.js';
import { EntityTypeFilter } from './entity-type-filter.js';
import { RefreshButton } from './refresh-button.js';
import { ReportRow } from './report-row.js';
import { StatusFilter } from './status-filter.js';
import { TablePagination } from './table-pagination.js';
import { TableResultsRange } from './table-results-range.js';

export const ReportsTable = () => {
    const limit = useAtomValue(limitAtom);
    const [offset, setOffset] = useAtom(offsetAtom);
    const { data: rows = [], total, isLoading } = useReports();

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
                            <TableHead className="w-[280px]">Dataset</TableHead>
                            <TableHead className="w-[150px]">Status</TableHead>
                            <TableHead className="w-[150px]">Next refresh</TableHead>
                            <TableHead className="w-[100px]">Errors</TableHead>
                            <TableHead className="">Report ID</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && !isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    No records found in this window.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map(summary => <ReportRow key={summary.uid} summary={summary} />)
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

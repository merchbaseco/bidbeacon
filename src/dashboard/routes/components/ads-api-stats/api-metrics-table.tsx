import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableRow } from '@/dashboard/components/ui/table';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { cn } from '@/dashboard/lib/utils';
import { useAdsApiMetrics } from '@/dashboard/routes/hooks/use-ads-api-metrics';

/**
 * API Metrics Table - Shows totals for each API endpoint with visual bars
 */
export function ApiMetricsTable({ className }: { className?: string }) {
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return { from: from.toISOString(), to: to.toISOString() };
    }, []);

    const { data } = useAdsApiMetrics(dateRange);

    // Calculate totals from chart data
    const apiTotals = useMemo(() => {
        if (!(data?.data && data?.apiNames)) {
            return [];
        }
        return data.apiNames
            .map((apiName, index) => {
                const total = data.data.reduce((sum, point) => sum + ((point[apiName] as number) || 0), 0);
                return { name: apiName, total, color: LEGEND_COLORS[index % LEGEND_COLORS.length] };
            })
            .sort((a, b) => b.total - a.total);
    }, [data]);

    const maxCount = useMemo(() => {
        if (apiTotals.length === 0) {
            return 1;
        }
        return Math.max(...apiTotals.map(api => api.total));
    }, [apiTotals]);

    // Ensure exactly 5 rows
    const rowsToRender = useMemo(() => {
        const rows: Array<((typeof apiTotals)[number] & { id: string }) | { id: string; placeholder: true }> = apiTotals.map(api => ({ ...api, id: api.name }));
        while (rows.length < 5) {
            rows.push({ id: `api-empty-placeholder-${rows.length}`, placeholder: true as const });
        }
        return rows.slice(0, 5);
    }, [apiTotals]);

    return (
        <div className={cn('[&_[data-slot=table-container]]:!overflow-x-auto [&_[data-slot=table-container]]:!overflow-y-visible overflow-visible', className)}>
            <Table>
                <TableBody>
                    {rowsToRender.map(row => {
                        if ('placeholder' in row) {
                            return (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2 pl-1">
                                            <span className="size-2.5 shrink-0 rounded-full opacity-0" />
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="relative flex h-6 w-full items-center">
                                            <div className="flex h-full min-w-fit items-center rounded bg-transparent px-2" style={{ width: '0%' }}>
                                                <span className="whitespace-nowrap text-foreground text-sm opacity-0">0</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        }
                        const percentage = maxCount > 0 ? (row.total / maxCount) * 100 : 0;
                        return (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <div className="flex items-center gap-2 pl-1">
                                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                                        {row.name}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="relative flex h-6 w-full items-center">
                                        <div className="flex h-full min-w-fit items-center rounded bg-muted px-2" style={{ width: `${Math.max(percentage, 0)}%` }}>
                                            <span className="whitespace-nowrap text-foreground text-sm">{row.total.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

import { useMemo } from 'react';
import { Frame } from '@/dashboard/components/ui/frame';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/dashboard/components/ui/table';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { useAdsApiMetrics } from '@/dashboard/routes/hooks/use-ads-api-metrics';

/**
 * API Metrics Table - Shows totals for each API endpoint with visual bars
 */
export function ApiMetricsTable() {
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return { from: from.toISOString(), to: to.toISOString() };
    }, []);

    const { data } = useAdsApiMetrics(dateRange);

    // Calculate totals from chart data
    const apiTotals = useMemo(() => {
        if (!data?.data || !data?.apiNames) return [];
        return data.apiNames
            .map((apiName, index) => {
                const total = data.data.reduce((sum, point) => sum + ((point[apiName] as number) || 0), 0);
                return { name: apiName, total, color: LEGEND_COLORS[index % LEGEND_COLORS.length] };
            })
            .sort((a, b) => b.total - a.total);
    }, [data]);

    const maxCount = useMemo(() => {
        if (apiTotals.length === 0) return 1;
        return Math.max(...apiTotals.map(api => api.total));
    }, [apiTotals]);

    return (
        <Frame className="w-full overflow-visible">
            <div className="overflow-visible [&_[data-slot=table-container]]:!overflow-x-auto [&_[data-slot=table-container]]:!overflow-y-visible">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>API Endpoint</TableHead>
                            <TableHead>Count</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {apiTotals.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} className="text-center text-muted-foreground">
                                    No API metrics available.
                                </TableCell>
                            </TableRow>
                        ) : (
                            apiTotals.map(api => {
                                const percentage = maxCount > 0 ? (api.total / maxCount) * 100 : 0;
                                return (
                                    <TableRow key={api.name}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: api.color }} />
                                                {api.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="relative w-full h-6 flex items-center">
                                                <div className="h-full bg-muted rounded flex items-center px-2 min-w-fit" style={{ width: `${Math.max(percentage, 0)}%` }}>
                                                    <span className="text-sm text-foreground whitespace-nowrap">{api.total.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </Frame>
    );
}

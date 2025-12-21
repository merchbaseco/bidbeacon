import { useMemo } from 'react';
import { Frame } from '@/dashboard/components/ui/frame';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/dashboard/components/ui/table';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { useAdsApiMetrics } from '@/dashboard/routes/hooks/use-ads-api-metrics';

/**
 * API Metrics Table Component
 *
 * Displays a table showing totals for each API endpoint with visual bars.
 */
export function ApiMetricsTable() {
    // Memoize from date to keep query key stable, but let server calculate 'to' as 'now' on each query
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return {
            from: from.toISOString(),
            // Don't pass 'to' - let server default to 'now' so we always get latest data
        };
    }, []); // Empty deps - only calculate once

    const { data } = useAdsApiMetrics(dateRange);

    // Calculate totals for each API
    const apiTotals = useMemo(() => {
        const apiNames = data?.apiNames || [];
        return apiNames
            .map((apiName, index) => {
                const apiData = data?.data[apiName] || [];
                const total = apiData.reduce((sum, point) => sum + point.count, 0);
                return {
                    name: apiName,
                    total,
                    color: LEGEND_COLORS[index % LEGEND_COLORS.length],
                };
            })
            .sort((a, b) => b.total - a.total); // Sort by total descending
    }, [data]);

    // Calculate max count for bar scaling
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

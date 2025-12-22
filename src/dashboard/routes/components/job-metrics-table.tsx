import { useMemo } from 'react';
import { Frame } from '@/dashboard/components/ui/frame';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/dashboard/components/ui/table';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { useJobMetrics } from '@/dashboard/routes/hooks/use-job-metrics';

/**
 * Job Metrics Table - Shows totals for each job with visual bars
 */
export function JobMetricsTable() {
    const dateRange = useMemo(() => {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 60 * 60 * 1000); // 3 hours
        return { from: from.toISOString(), to: to.toISOString() };
    }, []);

    const { data } = useJobMetrics(dateRange);

    // Calculate totals from chart data
    const jobTotals = useMemo(() => {
        if (!data?.jobNames || !data?.data) return [];
        return data.jobNames
            .map((jobName, index) => {
                const jobData = data.data[jobName] || [];
                const total = jobData.reduce((sum, point) => sum + point.count, 0);
                return { name: jobName, total, color: LEGEND_COLORS[index % LEGEND_COLORS.length] };
            })
            .sort((a, b) => b.total - a.total);
    }, [data]);

    const maxCount = useMemo(() => {
        if (jobTotals.length === 0) return 1;
        return Math.max(...jobTotals.map(job => job.total));
    }, [jobTotals]);

    return (
        <Frame className="w-full overflow-visible">
            <div className="overflow-visible [&_[data-slot=table-container]]:!overflow-x-auto [&_[data-slot=table-container]]:!overflow-y-visible">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Job Name</TableHead>
                            <TableHead>Count</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {jobTotals.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} className="text-center text-muted-foreground">
                                    No job metrics available.
                                </TableCell>
                            </TableRow>
                        ) : (
                            jobTotals.map(job => {
                                const percentage = maxCount > 0 ? (job.total / maxCount) * 100 : 0;
                                return (
                                    <TableRow key={job.name}>
                                        <TableCell>
                                            <div className="flex items-center gap-2 pl-1">
                                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: job.color }} />
                                                {job.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="relative w-full h-6 flex items-center">
                                                <div className="h-full bg-muted rounded flex items-center px-2 min-w-fit" style={{ width: `${Math.max(percentage, 0)}%` }}>
                                                    <span className="text-sm text-foreground whitespace-nowrap">{job.total.toLocaleString()}</span>
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

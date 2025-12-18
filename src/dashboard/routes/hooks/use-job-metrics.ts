import { api } from '../../lib/trpc.js';

export type JobMetricsResponse = {
    success: boolean;
    data: Record<string, JobMetricsDataPoint[]>;
    jobNames: string[];
    from: string;
    to: string;
};

export type JobMetricsDataPoint = {
    interval: string;
    count: number;
    avgDuration: number;
    successCount: number;
    errorCount: number;
};

export function useJobMetrics(params?: { from?: string; to?: string; jobName?: string }) {
    return api.metrics.job.useQuery(
        {
            from: params?.from,
            to: params?.to,
            jobName: params?.jobName,
        },
        {
            refetchInterval: 300000, // Refetch every 5 minutes
            staleTime: 60000, // Consider data fresh for 1 minute
        }
    );
}

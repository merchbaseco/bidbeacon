import { api } from '../../lib/trpc.js';

export type ApiMetricsResponse = {
    success: boolean;
    data: Record<string, ApiMetricsDataPoint[]>;
    apiNames: string[];
    from: string;
    to: string;
};

export type ApiMetricsDataPoint = {
    interval: string;
    count: number;
    avgDuration: number;
    successCount: number;
    errorCount: number;
};

export function useApiMetrics(params?: { from?: string; to?: string; apiName?: string }) {
    return api.metrics.api.useQuery(
        {
            from: params?.from,
            to: params?.to,
            apiName: params?.apiName,
        },
        {
            refetchInterval: 300000, // Refetch every 5 minutes
            staleTime: 60000, // Consider data fresh for 1 minute
        }
    );
}

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { type ApiMetricsResponse, fetchApiMetrics } from './api.js';
import { queryKeys } from './query-keys.js';

export function useApiMetrics(params?: { from?: string; to?: string; apiName?: string }): UseQueryResult<ApiMetricsResponse> {
    return useQuery<ApiMetricsResponse>({
        queryKey: queryKeys.apiMetrics(params?.from, params?.to, params?.apiName),
        queryFn: async () => {
            return fetchApiMetrics(params ?? {});
        },
        refetchInterval: 60000, // Refetch every minute
    });
}

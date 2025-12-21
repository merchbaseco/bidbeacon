import { api } from '../../lib/trpc';

export const useJobMetrics = (params: { from: string; to: string; jobName?: string }) => {
    const { data, isLoading, ...rest } = api.metrics.job.useQuery(params, {
        refetchInterval: 300000,
        staleTime: 60000,
    });

    return {
        data,
        isLoading,
        ...rest,
    };
};

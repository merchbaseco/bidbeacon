import { api } from '../../lib/trpc';

export const useJobMetrics = (params?: { from?: string; to?: string; jobName?: string }) => {
    const { data, isLoading, ...rest } = api.metrics.job.useQuery(
        {
            from: params?.from,
            to: params?.to,
            jobName: params?.jobName,
        },
        {
            refetchInterval: 300000,
            staleTime: 60000,
        }
    );

    return {
        data,
        isLoading,
        ...rest,
    };
};

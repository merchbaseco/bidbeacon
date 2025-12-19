import { api } from '../../lib/trpc';

export const useApiMetrics = (params?: { from?: string; to?: string; apiName?: string }) => {
    const { data, isLoading, ...rest } = api.metrics.api.useQuery(
        {
            from: params?.from,
            to: params?.to,
            apiName: params?.apiName,
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

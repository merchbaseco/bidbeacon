import { api } from '../../lib/trpc';

export const useAdsApiMetrics = (params: { from: string; to: string; apiName?: string }) => {
    const { data, isLoading, ...rest } = api.metrics.adsApi.useQuery(params, {
        refetchInterval: 300_000,
        staleTime: 60_000,
    });

    return {
        data,
        isLoading,
        ...rest,
    };
};

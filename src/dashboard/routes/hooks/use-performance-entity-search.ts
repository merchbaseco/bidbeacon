import { api } from '@/dashboard/lib/trpc';

const usePerformanceEntitySearch = ({ accountId, query }: { accountId: string; query: string }) => {
    const trimmedQuery = query.trim();
    const shouldSearch = trimmedQuery.length >= 2;

    const { data, isFetching } = api.metrics.searchEntities.useQuery(
        {
            accountId,
            query: trimmedQuery,
        },
        {
            enabled: shouldSearch,
            staleTime: 30000,
        }
    );

    const results = data?.results ?? [];

    return {
        results,
        isFetching,
        shouldSearch,
    };
};

export { usePerformanceEntitySearch };

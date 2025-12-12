import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reprocessDataset } from './api.js';
import { queryKeys } from './query-keys.js';

type Aggregation = 'daily' | 'hourly';

export function useReprocess(accountId: string, aggregation: Aggregation) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: (timestamp: string) => reprocessDataset({ accountId, timestamp, aggregation }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStatusAll() });
        },
    });

    return {
        reprocessAt: mutation.mutate,
        pending: mutation.isPending ? (mutation.variables ?? null) : null,
    };
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toastManager } from '../../components/ui/toast.js';
import { reprocessDataset } from './api.js';
import { queryKeys } from './query-keys.js';

type Aggregation = 'daily' | 'hourly';

export function useReprocess(accountId: string, aggregation: Aggregation) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (timestamp: string) => {
            return await reprocessDataset({ accountId, timestamp, aggregation });
        },
        onSuccess: () => {
            // Invalidate and refetch queries
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStatusAll() });
            // Refetch after a short delay to catch the job completion
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStatusAll() });
            }, 2000);
            toastManager.add({
                type: 'success',
                title: 'Reprocess queued',
                description: 'The reprocess job has been queued successfully.',
            });
        },
        onError: (error: Error) => {
            toastManager.add({
                type: 'error',
                title: 'Failed to queue reprocess',
                description: error.message || 'An error occurred while queuing the reprocess job.',
            });
        },
    });

    return {
        reprocessAt: mutation.mutate,
        pending: mutation.isPending ? (mutation.variables ?? null) : null,
    };
}

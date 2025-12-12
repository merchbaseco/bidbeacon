import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerUpdate as triggerUpdateApi } from './api.js';
import { queryKeys } from './query-keys.js';

export function useTriggerUpdate(accountId: string) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: () => triggerUpdateApi(accountId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStatusAll() });
        },
    });

    return { triggerUpdate: mutation.mutate, pending: mutation.isPending };
}

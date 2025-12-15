import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AccountDatasetMetadata, fetchAccountDatasetMetadata, triggerSyncAdEntities } from './api.js';
import { queryKeys } from './query-keys.js';

export function useAccountDatasetMetadata(accountId: string | null, countryCode: string | null) {
    return useQuery<AccountDatasetMetadata | null>({
        queryKey: queryKeys.accountDatasetMetadata(accountId ?? '', countryCode ?? ''),
        queryFn: () => {
            if (!accountId || !countryCode) {
                return Promise.resolve(null);
            }
            return fetchAccountDatasetMetadata(accountId, countryCode);
        },
        enabled: Boolean(accountId && countryCode),
    });
}

export function useTriggerSyncAdEntities() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ accountId, countryCode }: { accountId: string; countryCode: string }) => triggerSyncAdEntities(accountId, countryCode),
        onSuccess: (_data, variables) => {
            // Invalidate the metadata query to refetch
            queryClient.invalidateQueries({
                queryKey: queryKeys.accountDatasetMetadata(variables.accountId, variables.countryCode),
            });
        },
    });
}

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
        onMutate: async ({ accountId, countryCode }) => {
            // Cancel outgoing refetches to avoid overwriting optimistic update
            await queryClient.cancelQueries({
                queryKey: queryKeys.accountDatasetMetadata(accountId, countryCode),
            });

            // Snapshot the previous value
            const previousMetadata = queryClient.getQueryData<AccountDatasetMetadata | null>(queryKeys.accountDatasetMetadata(accountId, countryCode));

            // Optimistically update to 'syncing' state immediately
            queryClient.setQueryData<AccountDatasetMetadata | null>(queryKeys.accountDatasetMetadata(accountId, countryCode), old => {
                if (!old) {
                    return {
                        accountId,
                        countryCode,
                        status: 'syncing' as const,
                        lastSyncStarted: new Date().toISOString(),
                        lastSyncCompleted: null,
                        campaignsCount: null,
                        adGroupsCount: null,
                        adsCount: null,
                        targetsCount: null,
                        error: null,
                    };
                }
                return {
                    ...old,
                    status: 'syncing' as const,
                    lastSyncStarted: new Date().toISOString(),
                    error: null,
                };
            });

            // Return context for rollback
            return { previousMetadata };
        },
        onError: (_err, variables, context) => {
            // Rollback optimistic update on error
            if (context?.previousMetadata !== undefined) {
                queryClient.setQueryData(queryKeys.accountDatasetMetadata(variables.accountId, variables.countryCode), context.previousMetadata);
            }
        },
        onSuccess: (_data, variables) => {
            // Refetch to get the actual server state (in case optimistic update was slightly off)
            queryClient.invalidateQueries({
                queryKey: queryKeys.accountDatasetMetadata(variables.accountId, variables.countryCode),
            });
        },
    });
}

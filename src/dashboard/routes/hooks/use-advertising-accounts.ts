import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchListAdvertisingAccounts, toggleAdvertiserAccount } from './api.js';
import { queryKeys } from './query-keys.js';

export type AdvertisingAccount = {
    id: string;
    adsAccountId: string;
    accountName: string;
    status: string;
    countryCode: string;
    profileId: string | null;
    entityId: string | null;
    enabled: boolean;
};

export function useAdvertisingAccounts() {
    return useQuery<AdvertisingAccount[]>({
        queryKey: queryKeys.advertisingAccounts(),
        queryFn: fetchListAdvertisingAccounts,
    });
}

export function useToggleAdvertisingAccount() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ adsAccountId, profileId, enabled }: { adsAccountId: string; profileId: string; enabled: boolean }) => toggleAdvertiserAccount(adsAccountId, profileId, enabled),
        onMutate: async ({ adsAccountId, profileId, enabled }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.advertisingAccounts() });

            // Snapshot the previous value
            const previousAccounts = queryClient.getQueryData<AdvertisingAccount[]>(queryKeys.advertisingAccounts());

            // Optimistically update to the new value
            if (previousAccounts) {
                queryClient.setQueryData<AdvertisingAccount[]>(
                    queryKeys.advertisingAccounts(),
                    previousAccounts.map(account => (account.adsAccountId === adsAccountId && account.profileId === profileId ? { ...account, enabled } : account))
                );
            }

            // Return a context object with the snapshotted value
            return { previousAccounts };
        },
        onError: (_err, _variables, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousAccounts) {
                queryClient.setQueryData(queryKeys.advertisingAccounts(), context.previousAccounts);
            }
        },
        onSettled: () => {
            // Always refetch after error or success to ensure we have the latest data
            queryClient.invalidateQueries({ queryKey: queryKeys.advertisingAccounts() });
        },
    });
}

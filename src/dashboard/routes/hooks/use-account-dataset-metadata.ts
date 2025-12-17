import { api } from '../../lib/trpc.js';

export type AccountDatasetMetadata = {
    accountId: string;
    countryCode: string;
    status: 'idle' | 'syncing' | 'completed' | 'failed';
    lastSyncStarted: string | null;
    lastSyncCompleted: string | null;
    campaignsCount: number | null;
    adGroupsCount: number | null;
    adsCount: number | null;
    targetsCount: number | null;
    error: string | null;
};

export function useAccountDatasetMetadata(accountId: string | null, countryCode: string | null) {
    return api.accounts.datasetMetadata.useQuery(
        {
            accountId: accountId ?? '',
            countryCode: countryCode ?? '',
        },
        {
            enabled: Boolean(accountId && countryCode),
            select: response => response.data,
        }
    );
}

export function useTriggerSyncAdEntities() {
    const utils = api.useUtils();

    return api.sync.triggerAdEntities.useMutation({
        onMutate: async ({ accountId, countryCode }) => {
            // Cancel outgoing refetches to avoid overwriting optimistic update
            await utils.accounts.datasetMetadata.cancel({
                accountId,
                countryCode,
            });

            // Snapshot the previous value (already selected, so it's just the metadata object or null)
            const previousMetadata = utils.accounts.datasetMetadata.getData({
                accountId,
                countryCode,
            });

            // Optimistically update to 'syncing' state immediately
            // Since we use select, setData receives the selected data (metadata object), not the full response
            utils.accounts.datasetMetadata.setData({ accountId, countryCode }, old => {
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
                utils.accounts.datasetMetadata.setData({ accountId: variables.accountId, countryCode: variables.countryCode }, context.previousMetadata);
            }
        },
        onSuccess: (_data, variables) => {
            // Refetch to get the actual server state (in case optimistic update was slightly off)
            utils.accounts.datasetMetadata.invalidate({
                accountId: variables.accountId,
                countryCode: variables.countryCode,
            });
        },
    });
}

import { api } from '../../lib/trpc.js';

export type AccountDatasetMetadata = {
    accountId: string;
    countryCode: string;
    lastSyncStarted: string | null;
    lastSyncCompleted: string | null;
    campaignsCount: number | null;
    adGroupsCount: number | null;
    adsCount: number | null;
    targetsCount: number | null;
    error: string | null;
    fetchingCampaigns: boolean | null;
    fetchingCampaignsPollCount: number | null;
    fetchingAdGroups: boolean | null;
    fetchingAdGroupsPollCount: number | null;
    fetchingAds: boolean | null;
    fetchingAdsPollCount: number | null;
    fetchingTargets: boolean | null;
    fetchingTargetsPollCount: number | null;
};

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'failed';

/**
 * Derives the overall sync status from the metadata fields.
 * Status is determined by:
 * - If any fetching flag is true → 'syncing'
 * - If lastSyncStarted exists and no fetching flags are true and no error and no lastSyncCompleted → 'syncing' (database insert phase)
 * - If error exists → 'failed'
 * - If lastSyncCompleted exists → 'completed'
 * - Otherwise → 'idle'
 */
export function deriveSyncStatus(metadata: AccountDatasetMetadata | null | undefined): SyncStatus {
    if (!metadata) {
        return 'idle';
    }

    // If any export is currently being fetched, we're syncing
    if (metadata.fetchingCampaigns === true || metadata.fetchingAdGroups === true || metadata.fetchingAds === true || metadata.fetchingTargets === true) {
        return 'syncing';
    }

    // If there's an error, status is failed
    if (metadata.error) {
        return 'failed';
    }

    // If sync completed successfully, status is completed
    if (metadata.lastSyncCompleted) {
        return 'completed';
    }

    // If sync has started but not completed and no error, we're still syncing (database insert phase)
    if (metadata.lastSyncStarted && !metadata.error) {
        return 'syncing';
    }

    // Otherwise, idle
    return 'idle';
}

export function useAccountDatasetMetadata(accountId: string | null, countryCode: string | null) {
    return api.accounts.datasetMetadata.useQuery(
        {
            accountId: accountId ?? '',
            countryCode: countryCode ?? '',
        },
        {
            enabled: Boolean(accountId && countryCode),
        }
    );
}

export function useTriggerSyncAdEntities() {
    const utils = api.useUtils();

    return api.accounts.syncAdEntities.useMutation({
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
                        lastSyncStarted: new Date().toISOString(),
                        lastSyncCompleted: null,
                        campaignsCount: null,
                        adGroupsCount: null,
                        adsCount: null,
                        targetsCount: null,
                        error: null,
                        fetchingCampaigns: false,
                        fetchingCampaignsPollCount: 0,
                        fetchingAdGroups: false,
                        fetchingAdGroupsPollCount: 0,
                        fetchingAds: false,
                        fetchingAdsPollCount: 0,
                        fetchingTargets: false,
                        fetchingTargetsPollCount: 0,
                    };
                }
                return {
                    ...old,
                    lastSyncStarted: new Date().toISOString(),
                    error: null,
                    fetchingCampaigns: false,
                    fetchingCampaignsPollCount: 0,
                    fetchingAdGroups: false,
                    fetchingAdGroupsPollCount: 0,
                    fetchingAds: false,
                    fetchingAdsPollCount: 0,
                    fetchingTargets: false,
                    fetchingTargetsPollCount: 0,
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

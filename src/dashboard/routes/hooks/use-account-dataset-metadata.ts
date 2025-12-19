import { api } from '../../lib/trpc';

export const useAccountDatasetMetadata = (accountId: string, countryCode: string) => {
    const utils = api.useUtils();

    const { data, isLoading } = api.accounts.datasetMetadata.useQuery(
        {
            accountId: accountId ?? '',
            countryCode: countryCode ?? '',
        },
        {
            enabled: Boolean(accountId && countryCode),
        }
    );

    const fetchingAnyDataset = data?.fetchingCampaigns === true || data?.fetchingAdGroups === true || data?.fetchingAds === true || data?.fetchingTargets === true;

    const { mutate: sync } = api.accounts.syncAdEntities.useMutation({
        onMutate: () => {
            utils.accounts.datasetMetadata.setData(
                { accountId: accountId, countryCode: countryCode },
                prev => prev && { ...prev, fetchingCampaigns: true, fetchingAdGroups: true, fetchingAds: true, fetchingTargets: true }
            );
        },
    });

    return {
        data,
        isLoading,
        isSyncing: fetchingAnyDataset,
        sync,
    };
};

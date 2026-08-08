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
    const { data: productMetadataCoverage, isLoading: isProductMetadataCoverageLoading } = api.accounts.productMetadataCoverage.useQuery(
        { accountId: accountId ?? '', countryCode: countryCode ?? '' },
        { enabled: Boolean(accountId && countryCode) }
    );

    const fetchingAnyDataset =
        data?.fetchingCampaigns === true || data?.fetchingAdGroups === true || data?.fetchingAds === true || data?.fetchingTargets === true || productMetadataCoverage?.fetching === true;

    const { mutate: sync } = api.accounts.syncAdEntities.useMutation({
        onMutate: () => {
            utils.accounts.datasetMetadata.setData({ accountId, countryCode }, prev => prev && { ...prev, fetchingCampaigns: true, fetchingAdGroups: true, fetchingAds: true, fetchingTargets: true });
            const previousCoverage = utils.accounts.productMetadataCoverage.getData({ accountId, countryCode });
            utils.accounts.productMetadataCoverage.setData({ accountId, countryCode }, prev => prev && { ...prev, fetching: true });
            return { previousCoverage };
        },
        onError: (_error, _input, context) => {
            utils.accounts.productMetadataCoverage.setData({ accountId, countryCode }, context?.previousCoverage);
        },
    });

    return {
        data,
        isLoading: isLoading || isProductMetadataCoverageLoading,
        isSyncing: fetchingAnyDataset,
        productMetadataCoverage,
        sync,
    };
};

import { useMemo } from 'react';
import { api } from '@/dashboard/lib/trpc';
import type { PerformanceDimension } from '@/types/performance-api';

const useAdsEntityDetails = ({
    accountId,
    entityType,
    entityId,
    enabled,
}: {
    accountId: string;
    entityType: PerformanceDimension;
    entityId: string;
    enabled?: boolean;
}) => {
    const campaignInput = useMemo(
        () => ({ accountId, campaignId: entityId }),
        [accountId, entityId]
    );
    const adGroupInput = useMemo(
        () => ({ accountId, adGroupId: entityId }),
        [accountId, entityId]
    );
    const adInput = useMemo(
        () => ({ accountId, adId: entityId }),
        [accountId, entityId]
    );
    const targetInput = useMemo(
        () => ({ accountId, targetId: entityId }),
        [accountId, entityId]
    );

    const campaignQuery = api.ads.campaigns.get.useQuery(campaignInput, {
        enabled: Boolean(enabled && entityType === 'campaign'),
    });
    const adGroupQuery = api.ads.adGroups.get.useQuery(adGroupInput, {
        enabled: Boolean(enabled && entityType === 'adGroup'),
    });
    const adQuery = api.ads.ads.get.useQuery(adInput, {
        enabled: Boolean(enabled && entityType === 'ad'),
    });
    const targetQuery = api.ads.targets.get.useQuery(targetInput, {
        enabled: Boolean(enabled && entityType === 'target'),
    });

    const data =
        entityType === 'campaign'
            ? campaignQuery.data
            : entityType === 'adGroup'
              ? adGroupQuery.data
              : entityType === 'ad'
                ? adQuery.data
                : targetQuery.data;

    const isLoading =
        entityType === 'campaign'
            ? campaignQuery.isLoading
            : entityType === 'adGroup'
              ? adGroupQuery.isLoading
              : entityType === 'ad'
                ? adQuery.isLoading
                : targetQuery.isLoading;

    const error =
        entityType === 'campaign'
            ? campaignQuery.error
            : entityType === 'adGroup'
              ? adGroupQuery.error
              : entityType === 'ad'
                ? adQuery.error
                : targetQuery.error;

    return {
        data,
        isLoading,
        error,
    };
};

export { useAdsEntityDetails };

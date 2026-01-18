import { api } from '../../lib/trpc';

type UseEventsParams = {
    accountId: string;
    countryCode: string;
    from: string;
    to: string;
    filterFrom?: string;
    filterTo?: string;
    limit?: number;
    jobName?: string;
    enabled?: boolean;
};

export const useEvents = (params: UseEventsParams) => {
    const input = {
        accountId: params.accountId,
        countryCode: params.countryCode,
        from: params.from,
        to: params.to,
        filterFrom: params.filterFrom,
        filterTo: params.filterTo,
        limit: params.limit ?? 100,
        jobName: params.jobName,
    };

    return api.metrics.events.useQuery(input, {
        enabled: params.enabled ?? true,
        refetchInterval: 60000,
        staleTime: 30000,
    });
};

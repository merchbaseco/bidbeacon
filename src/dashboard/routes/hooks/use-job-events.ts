import { api } from '../../lib/trpc';

const DEFAULT_LIMIT = 20;

type UseJobEventsParams = {
    limit?: number;
    jobName?: string;
    since?: string;
    accountId?: string | null;
    countryCode?: string | null;
    enabled?: boolean;
};

export const useJobEvents = (params?: UseJobEventsParams) => {
    const input = {
        limit: params?.limit ?? DEFAULT_LIMIT,
        jobName: params?.jobName,
        since: params?.since,
        accountId: params?.accountId || undefined,
        countryCode: params?.countryCode || undefined,
    };

    return api.metrics.jobEvents.useQuery(input, {
        enabled: params?.enabled ?? true,
        refetchInterval: 60000,
        staleTime: 30000,
    });
};

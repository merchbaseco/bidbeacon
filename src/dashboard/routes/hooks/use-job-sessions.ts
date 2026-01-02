import { api } from '../../lib/trpc';

const DEFAULT_LIMIT = 20;

type UseJobSessionsParams = {
    limit?: number;
    jobName?: string;
    since?: string;
    accountId?: string | null;
    countryCode?: string | null;
    enabled?: boolean;
};

export const useJobSessions = (params?: UseJobSessionsParams) => {
    const input = {
        limit: params?.limit ?? DEFAULT_LIMIT,
        jobName: params?.jobName,
        since: params?.since,
        accountId: params?.accountId || undefined,
        countryCode: params?.countryCode || undefined,
    };

    return api.metrics.jobSessions.useQuery(input, {
        enabled: params?.enabled ?? true,
        refetchInterval: 60000,
        staleTime: 30000,
    });
};

import { api } from '../../lib/trpc';

const DEFAULT_LIMIT = 40;

type UseJobEventsParams = {
    limit?: number;
    jobName?: string;
    since?: string;
};

export const useJobEvents = (params?: UseJobEventsParams) => {
    const input = {
        limit: params?.limit ?? DEFAULT_LIMIT,
        jobName: params?.jobName,
        since: params?.since,
    };

    return api.metrics.jobEvents.useQuery(input, {
        refetchInterval: 60000,
        staleTime: 30000,
    });
};

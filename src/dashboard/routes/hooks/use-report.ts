import { api } from '../../lib/trpc';
import { useWebSocketEvents } from './use-websocket-events';

interface UseReportOptions {
    uid: string | null | undefined;
}

export const useReport = ({ uid }: UseReportOptions) => {
    const apiUtils = api.useUtils();
    const { data: report, isLoading, ...rest } = api.reports.get.useQuery(
        { uid: uid! },
        {
            enabled: !!uid,
            staleTime: Infinity, // Never refetch due to staleness - rely on WebSocket events for invalidation
        }
    );

    // Invalidate this specific report when it's refreshed
    useWebSocketEvents('report:refreshed', event => {
        if (event.row.uid === uid) {
            apiUtils.reports.get.invalidate({ uid: uid! });
        }
    });

    return {
        report,
        isLoading,
        ...rest,
    };
};


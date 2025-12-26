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

    // Update this specific report's cache directly when it's refreshed
    // Using setData instead of invalidate to avoid re-fetching - the event contains the full row data
    // Note: dates are ISO strings (no superjson transformer on tRPC client)
    useWebSocketEvents('report:refreshed', event => {
        if (event.row.uid === uid) {
            apiUtils.reports.get.setData({ uid: uid! }, prev => (prev ? { ...prev, ...event.row } : undefined));
        }
    });

    return {
        report,
        isLoading,
        ...rest,
    };
};


import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/trpc';
import { useSelectedCountryCode } from './use-selected-country-code';
import { useWebSocketEvents } from './use-websocket-events';

export const useRefreshReportsTable = (accountId: string) => {
    const countryCode = useSelectedCountryCode();
    const [isWaitingForCompletion, setIsWaitingForCompletion] = useState(false);
    const utils = api.useUtils();
    const mutation = api.reports.triggerUpdate.useMutation({
        onSuccess: () => {
            // Set waiting state - we'll clear it when we receive the WebSocket event
            setIsWaitingForCompletion(true);
            // Invalidate the refresh status query to immediately check for active refreshes
            utils.reports.isAnyRefreshActive.invalidate({ accountId, countryCode });
            // Show success toast indicating the job was queued
            toast.success('Refresh queued', {
                description: 'The refresh job has been queued successfully. The table will update when it completes.',
            });
        },
        onError: error => {
            setIsWaitingForCompletion(false);
            toast.error('Failed to queue refresh', {
                description: error.message || 'An error occurred while queuing the refresh job.',
            });
        },
    });

    // Check if any rows are currently refreshing (across all pages, not just current view)
    const { data: refreshStatus } = api.reports.isAnyRefreshActive.useQuery(
        { accountId, countryCode },
        {
            enabled: !!countryCode,
            refetchInterval: 2000, // Poll every 2 seconds to catch state changes
        }
    );

    // Listen for the reports:refreshed event for this account
    useWebSocketEvents('reports:refreshed', event => {
        if (event.accountId === accountId) {
            setIsWaitingForCompletion(false);
            // Invalidate the refresh status query when refresh completes
            utils.reports.isAnyRefreshActive.invalidate({ accountId, countryCode });
        }
    });

    return {
        refresh: () => {
            mutation.mutate({ accountId, countryCode });
        },
        pending: mutation.isPending || isWaitingForCompletion || refreshStatus?.isActive === true,
    };
};

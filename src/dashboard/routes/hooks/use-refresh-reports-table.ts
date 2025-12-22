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
            setIsWaitingForCompletion(true);
            utils.reports.isAnyRefreshActive.invalidate({ accountId, countryCode });
        },
        onError: error => {
            setIsWaitingForCompletion(false);
            toast.error('Failed to queue refresh', {
                description: error.message || 'An error occurred while queuing the refresh job.',
            });
        },
    });

    // Check if any rows are currently refreshing (across all pages, not just current view)
    // Only fetch on initial load to get current state; button clicks handle refreshing state
    const { data: refreshStatus } = api.reports.isAnyRefreshActive.useQuery(
        { accountId, countryCode },
        {
            enabled: !!countryCode,
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

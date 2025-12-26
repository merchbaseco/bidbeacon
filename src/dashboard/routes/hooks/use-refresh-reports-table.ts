import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/trpc';
import { useSelectedCountryCode } from './use-selected-country-code';
import { useWebSocketEvents } from './use-websocket-events';

export const useRefreshReportsTable = (accountId: string) => {
    const countryCode = useSelectedCountryCode();
    const [isWaitingForCompletion, setIsWaitingForCompletion] = useState(false);
    const mutation = api.reports.triggerUpdate.useMutation({
        onSuccess: () => {
            setIsWaitingForCompletion(true);
        },
        onError: error => {
            setIsWaitingForCompletion(false);
            toast.error('Failed to queue refresh', {
                description: error.message || 'An error occurred while queuing the refresh job.',
            });
        },
    });

    // Listen for the reports:refreshed event for this account
    // This event fires when the update-report-dataset-for-account job completes
    useWebSocketEvents('reports:refreshed', event => {
        if (event.accountId === accountId) {
            setIsWaitingForCompletion(false);
        }
    });

    return {
        refresh: () => {
            mutation.mutate({ accountId, countryCode });
        },
        pending: mutation.isPending || isWaitingForCompletion,
    };
};

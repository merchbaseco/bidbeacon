import { toast } from 'sonner';
import { api } from '../../lib/trpc.js';
import { useSelectedCountryCode } from './use-selected-country-code.js';

export function useRefreshReportsTable(accountId: string) {
    const countryCode = useSelectedCountryCode();
    const mutation = api.reports.triggerUpdate.useMutation({
        onSuccess: () => {
            // Show success toast indicating the job was queued
            toast.success('Refresh queued', {
                description: 'The refresh job has been queued successfully. The table will update when it completes.',
                duration: 5000, // Auto-dismiss after 5 seconds
            });
            // Note: We don't invalidate queries here - the WebSocket event will handle that
        },
        onError: error => {
            toast.error('Failed to queue refresh', {
                description: error.message || 'An error occurred while queuing the refresh job.',
            });
        },
    });

    return {
        refreshReportsTable: () => {
            if (!countryCode) {
                toast.error('Country code required', {
                    description: 'Country code is required to trigger update',
                });
                return;
            }
            mutation.mutate({ accountId, countryCode });
        },
        pending: mutation.isPending,
    };
}

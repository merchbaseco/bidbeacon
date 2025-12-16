import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { triggerUpdate as triggerUpdateApi } from './api.js';
import { useSelectedCountryCode } from './use-selected-country-code.js';

export function useRefreshReportsTable(accountId: string) {
    const countryCode = useSelectedCountryCode();
    const mutation = useMutation({
        mutationFn: () => {
            if (!countryCode) {
                throw new Error('Country code is required to trigger update');
            }
            return triggerUpdateApi(accountId, countryCode);
        },
        onSuccess: () => {
            // Show success toast indicating the job was queued
            toast.success('Refresh queued', {
                description: 'The refresh job has been queued successfully. The table will update when it completes.',
                duration: 5000, // Auto-dismiss after 5 seconds
            });
            // Note: We don't invalidate queries here - the WebSocket event will handle that
        },
        onError: (error: Error) => {
            toast.error('Failed to queue refresh', {
                description: error.message || 'An error occurred while queuing the refresh job.',
            });
        },
    });

    return { refreshReportsTable: mutation.mutate, pending: mutation.isPending };
}

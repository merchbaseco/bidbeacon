import { toast } from 'sonner';
import { api } from '../../lib/trpc';
import { useSelectedCountryCode } from './use-selected-country-code';

export const useRefreshReportsTable = (accountId: string) => {
    const countryCode = useSelectedCountryCode();
    const mutation = api.reports.triggerUpdate.useMutation({
        onSuccess: () => {
            // Show success toast indicating the job was queued
            toast.success('Refresh queued', {
                description: 'The refresh job has been queued successfully. The table will update when it completes.',
            });
        },
        onError: error => {
            toast.error('Failed to queue refresh', {
                description: error.message || 'An error occurred while queuing the refresh job.',
            });
        },
    });

    return {
        refresh: () => {
            mutation.mutate({ accountId, countryCode });
        },
        pending: mutation.isPending,
    };
};

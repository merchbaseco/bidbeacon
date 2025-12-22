import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Spinner } from '../../../components/ui/spinner';
import { api } from '../../../lib/trpc.js';
import type { ReportDatasetMetadata } from '../../hooks/use-report-datasets';

interface ReportRefreshButtonProps {
    row: ReportDatasetMetadata;
    accountId: string;
}

export function ReportRefreshButton({ row, accountId }: ReportRefreshButtonProps) {
    const [localRefreshing, setLocalRefreshing] = useState(false);

    const mutation = api.reports.refresh.useMutation({
        onMutate: () => {
            setLocalRefreshing(true);
        },
        onError: error => {
            setLocalRefreshing(false);
            toast.error('Report refresh failed', {
                description: error.message,
            });
        },
        // Note: We don't reset localRefreshing in onSuccess because the mutation
        // only queues the job - the actual refresh happens asynchronously.
        // The WebSocket event will update row.refreshing when the job completes.
    });

    // Reset local state when row.refreshing becomes false (from WebSocket update)
    // Use the actual refreshing value from the row to ensure we're in sync
    useEffect(() => {
        if (!row.refreshing) {
            setLocalRefreshing(false);
        }
    }, [row.refreshing]);

    const handleClick = () => {
        if (!accountId || !row.countryCode) return;
        mutation.mutate({
            accountId,
            countryCode: row.countryCode,
            timestamp: row.periodStart,
            aggregation: row.aggregation,
            entityType: row.entityType,
        });
    };

    // Show spinner if either the row is refreshing OR we're in local refreshing state
    // This handles the gap between clicking and the WebSocket update
    const showSpinner = row.refreshing || localRefreshing;

    return (
        <Button variant="secondary" size="icon" onClick={handleClick} disabled={showSpinner}>
            {showSpinner ? <Spinner className="size-5" /> : <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={20} />}
        </Button>
    );
}


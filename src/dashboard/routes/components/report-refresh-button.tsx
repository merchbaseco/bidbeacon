import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { api } from '../../lib/trpc.js';
import type { ReportDatasetMetadata } from '../hooks/use-report-datasets';

interface ReportRefreshButtonProps {
    row: ReportDatasetMetadata;
    accountId: string;
}

export function ReportRefreshButton({ row, accountId }: ReportRefreshButtonProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const mutation = api.reports.refresh.useMutation({
        onMutate: () => {
            setIsRefreshing(true);
        },
        onError: error => {
            setIsRefreshing(false);
            toast.error('Report refresh failed', {
                description: error.message,
            });
        },
    });

    // Reset local state when row.refreshing becomes false (from WebSocket update)
    useEffect(() => {
        if (!row.refreshing) {
            setIsRefreshing(false);
        }
    }, [row.refreshing]);

    const handleClick = () => {
        if (!accountId || !row.countryCode) return;
        mutation.mutate({
            accountId,
            countryCode: row.countryCode,
            timestamp: row.timestamp,
            aggregation: row.aggregation,
            entityType: row.entityType,
        });
    };

    const showSpinner = row.refreshing || isRefreshing;

    return (
        <Button variant="secondary" size="icon" onClick={handleClick} disabled={showSpinner}>
            {showSpinner ? <Spinner className="size-5" /> : <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={20} />}
        </Button>
    );
}

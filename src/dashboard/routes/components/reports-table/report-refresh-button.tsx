import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { Button } from '@/dashboard/components/ui/button.js';
import { Spinner } from '../../../components/ui/spinner';
import { api } from '../../../lib/trpc.js';
import type { ReportDatasetMetadata } from '../../hooks/use-report-datasets';

interface ReportRefreshButtonProps {
    row: ReportDatasetMetadata;
    accountId: string;
}

export function ReportRefreshButton({ row, accountId }: ReportRefreshButtonProps) {
    const mutation = api.reports.refresh.useMutation({});

    const handleClick = () => {
        if (!accountId || !row.countryCode) return;
        mutation.mutate({
            accountId,
            countryCode: row.countryCode,
            timestamp: row.periodStart,
            aggregation: row.aggregation as 'hourly' | 'daily',
            entityType: row.entityType as 'target' | 'product',
        });
    };

    const showSpinner = row.refreshing;

    return (
        <Button variant="secondary" size="icon" onClick={handleClick} disabled={showSpinner}>
            {showSpinner ? <Spinner /> : <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={20} />}
        </Button>
    );
}

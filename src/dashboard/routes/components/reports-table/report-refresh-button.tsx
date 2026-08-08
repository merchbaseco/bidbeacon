import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowReloadHorizontalIcon } from '@hugeicons-pro/core-solid-rounded';
import { Button } from '@/dashboard/components/ui/button.js';
import { api } from '../../../lib/trpc.js';
import type { ReportDatasetMetadata } from '../../hooks/use-reports';

interface ReportRefreshButtonProps {
    row: ReportDatasetMetadata;
    accountId: string;
}

export function ReportRefreshButton({ row, accountId }: ReportRefreshButtonProps) {
    const apiUtils = api.useUtils();
    const mutation = api.reports.refresh.useMutation({});

    const handleClick = () => {
        if (!(accountId && row.countryCode)) {
            return;
        }
        mutation.mutate({
            accountId,
            countryCode: row.countryCode,
            timestamp: row.periodStart,
            aggregation: row.aggregation as 'hourly' | 'daily',
            entityType: 'target',
        });
        apiUtils.reports.get.setData({ uid: row.uid }, prev => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                refreshing: true,
            };
        });
    };

    return (
        <Button disabled={row.refreshing} onClick={handleClick} size="icon" variant="secondary">
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={20} />
        </Button>
    );
}

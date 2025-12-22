import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { Button } from '../../../components/ui/button';
import { ButtonGroup } from '../../../components/ui/button-group';
import { Spinner } from '../../../components/ui/spinner';
import { useRefreshReportsTable } from '../../hooks/use-refresh-reports-table';
import { useSelectedAccountId } from '../../hooks/use-selected-accountid';
import { useReportDatasets } from '../../hooks/use-report-datasets';

export const RefreshButton = () => {
    const accountId = useSelectedAccountId();
    const { isLoading } = useReportDatasets();
    const { refresh, pending } = useRefreshReportsTable(accountId);
    const isRefreshing = pending || isLoading;

    return (
        <ButtonGroup className="ml-auto">
            <Button variant="ghost" onClick={refresh} disabled={isRefreshing} className="inline-flex items-center gap-2">
                {isRefreshing ? <Spinner className="size-4" /> : <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} color="currentColor" />}
            </Button>
        </ButtonGroup>
    );
};


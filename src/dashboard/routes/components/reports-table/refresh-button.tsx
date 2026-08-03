import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowReloadHorizontalIcon } from '@hugeicons-pro/core-solid-rounded';
import { Button } from '../../../components/ui/button';
import { ButtonGroup } from '../../../components/ui/button-group';
import { Spinner } from '../../../components/ui/spinner';
import { useRefreshReportsTable } from '../../hooks/use-refresh-reports-table';
import { useReports } from '../../hooks/use-reports';
import { useSelectedAccountId } from '../../hooks/use-selected-accountid';

export const RefreshButton = () => {
    const accountId = useSelectedAccountId();
    const { isLoading } = useReports();
    const { refresh, pending } = useRefreshReportsTable(accountId);
    const isRefreshing = pending || isLoading;

    return (
        <ButtonGroup className="ml-auto">
            <Button className="inline-flex items-center gap-2" disabled={isRefreshing} onClick={refresh} variant="ghost">
                {isRefreshing ? <Spinner className="size-4" /> : <HugeiconsIcon color="currentColor" icon={ArrowReloadHorizontalIcon} size={16} />}
            </Button>
        </ButtonGroup>
    );
};

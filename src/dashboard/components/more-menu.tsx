import { HugeiconsIcon } from '@hugeicons/react';
import MoreVerticalIcon from '@merchbaseco/icons/core-solid-rounded/MoreVerticalIcon';
import DatabaseSync01Icon from '@merchbaseco/icons/core-stroke-rounded/DatabaseSync01Icon';
import { useAtomValue, useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { api } from '../lib/trpc';
import { syncAccountsInProgressAtom } from '../routes/atoms';
import { Button } from './ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './ui/menu';

export function MoreMenu() {
    const utils = api.useUtils();
    const isSyncing = useAtomValue(syncAccountsInProgressAtom);
    const setIsSyncing = useSetAtom(syncAccountsInProgressAtom);

    const syncMutation = api.accounts.sync.useMutation({
        onSuccess: () => {
            // Close loading toast and show success toast
            toast.success('Accounts synced', {
                description: 'Advertising accounts table has been updated',
                duration: 5000, // Auto-dismiss after 5 seconds
            });

            // Invalidate advertising accounts query to refresh the UI
            // Note: API metrics chart will refresh automatically via the api-metrics:updated event
            utils.accounts.list.invalidate();
        },
        onError: err => {
            toast.error('Sync failed', {
                description: err.message || 'Failed to sync advertiser accounts',
            });
        },
    });

    const handleSyncAccounts = async () => {
        setIsSyncing(true);

        // Show loading toast
        const toastId = toast.loading('Syncing accounts', {
            description: 'Fetching advertiser accounts from Amazon Ads API...',
        });

        try {
            await syncMutation.mutateAsync(undefined);
        } finally {
            toast.dismiss(toastId);
            setIsSyncing(false);
        }
    };

    return (
        <Menu>
            <MenuTrigger>
                <Button variant="secondary" size="icon" disabled={isSyncing}>
                    <HugeiconsIcon icon={MoreVerticalIcon} size={24} />
                </Button>
            </MenuTrigger>
            <MenuPopup>
                <MenuItem onClick={handleSyncAccounts} disabled={isSyncing}>
                    <HugeiconsIcon icon={DatabaseSync01Icon} size={20} />
                    {isSyncing ? 'Syncing...' : 'Sync accounts'}
                </MenuItem>
            </MenuPopup>
        </Menu>
    );
}

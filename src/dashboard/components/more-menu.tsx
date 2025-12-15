import { HugeiconsIcon } from '@hugeicons/react';
import MoreVerticalIcon from '@merchbaseco/icons/core-solid-rounded/MoreVerticalIcon';
import DatabaseSync01Icon from '@merchbaseco/icons/core-stroke-rounded/DatabaseSync01Icon';
import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { syncAccountsInProgressAtom } from '../routes/atoms';
import { syncAdvertiserAccounts } from '../routes/hooks/api';
import { queryKeys } from '../routes/hooks/query-keys';
import { Button } from './ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './ui/menu';
import { toastManager } from './ui/toast';

export function MoreMenu() {
    const queryClient = useQueryClient();
    const isSyncing = useAtomValue(syncAccountsInProgressAtom);
    const setIsSyncing = useSetAtom(syncAccountsInProgressAtom);

    const handleSyncAccounts = async () => {
        setIsSyncing(true);

        // Show loading toast
        const toastId = toastManager.add({
            type: 'loading',
            title: 'Syncing accounts',
            description: 'Fetching advertiser accounts from Amazon Ads API...',
            timeout: 0, // Don't auto-dismiss loading toasts
        });

        try {
            await syncAdvertiserAccounts();

            // Close loading toast and show success toast
            toastManager.close(toastId);
            toastManager.add({
                type: 'success',
                title: 'Accounts synced',
                description: 'Advertising accounts table has been updated',
                timeout: 5000, // Auto-dismiss after 5 seconds
            });

            // Invalidate advertising accounts query to refresh the UI
            // Note: API metrics chart will refresh automatically via the api-metrics:updated event
            queryClient.invalidateQueries({
                queryKey: queryKeys.advertisingAccounts(),
            });
        } catch (err) {
            toastManager.close(toastId);
            toastManager.add({
                type: 'error',
                title: 'Sync failed',
                description: err instanceof Error ? err.message : 'Failed to sync advertiser accounts',
            });
        } finally {
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

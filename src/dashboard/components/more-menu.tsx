import { HugeiconsIcon } from '@hugeicons/react';
import MoreVerticalIcon from '@merchbaseco/icons/core-solid-rounded/MoreVerticalIcon';
import DatabaseSync01Icon from '@merchbaseco/icons/core-stroke-rounded/DatabaseSync01Icon';
import { useAtomValue, useSetAtom } from 'jotai';
import { loadingToastsAtom, syncAccountsInProgressAtom } from '../routes/atoms';
import { syncAdvertiserAccounts } from '../routes/hooks/api';
import { Button } from './ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './ui/menu';
import { toastManager } from './ui/toast';

const SYNC_ACCOUNTS_TOAST_KEY = 'sync-accounts-toast';

export function MoreMenu() {
    const isSyncing = useAtomValue(syncAccountsInProgressAtom);
    const setIsSyncing = useSetAtom(syncAccountsInProgressAtom);
    const setLoadingToasts = useSetAtom(loadingToastsAtom);

    const handleSyncAccounts = async () => {
        setIsSyncing(true);

        // Show loading toast (timeout: 0 prevents auto-dismiss)
        const toastId = toastManager.add({
            type: 'loading',
            title: 'Syncing accounts',
            description: 'Fetching advertiser accounts from Amazon Ads API...',
            timeout: 0, // Don't auto-dismiss loading toasts
        });

        // Store toast ID in atom for WebSocket hook to access
        setLoadingToasts(prev => ({
            ...prev,
            [SYNC_ACCOUNTS_TOAST_KEY]: toastId,
        }));

        try {
            await syncAdvertiserAccounts();
            // Toast will be updated by WebSocket hook when accounts:synced event arrives
        } catch (err) {
            toastManager.close(toastId);
            toastManager.add({
                type: 'error',
                title: 'Sync failed',
                description: err instanceof Error ? err.message : 'Failed to sync advertiser accounts',
            });
            setIsSyncing(false);
            setLoadingToasts(prev => {
                const next = { ...prev };
                delete next[SYNC_ACCOUNTS_TOAST_KEY];
                return next;
            });
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

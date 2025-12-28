import { HugeiconsIcon } from '@hugeicons/react';
import Moon02Icon from '@merchbaseco/icons/core-solid-rounded/Moon02Icon';
import MoreVerticalIcon from '@merchbaseco/icons/core-solid-rounded/MoreVerticalIcon';
import Sun03Icon from '@merchbaseco/icons/core-solid-rounded/Sun03Icon';
import DatabaseSync01Icon from '@merchbaseco/icons/core-stroke-rounded/DatabaseSync01Icon';
import { useAtomValue, useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { api } from '../lib/trpc';
import { cn } from '../lib/utils';
import { syncAccountsInProgressAtom } from '../routes/atoms';
import { useTheme } from '../routes/hooks/use-theme';
import { buttonVariants } from './ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './ui/menu';

export function MoreMenu() {
    const utils = api.useUtils();
    const isSyncing = useAtomValue(syncAccountsInProgressAtom);
    const setIsSyncing = useSetAtom(syncAccountsInProgressAtom);
    const { theme, toggleTheme } = useTheme();

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
            <MenuTrigger className={cn(buttonVariants({ variant: 'secondary', size: 'icon' }))} disabled={isSyncing}>
                <HugeiconsIcon icon={MoreVerticalIcon} size={24} />
            </MenuTrigger>
            <MenuPopup>
                <MenuItem onClick={handleSyncAccounts} disabled={isSyncing}>
                    <HugeiconsIcon icon={DatabaseSync01Icon} size={20} />
                    {isSyncing ? 'Syncing...' : 'Sync accounts'}
                </MenuItem>
                <MenuItem onClick={toggleTheme}>
                    <HugeiconsIcon icon={theme === 'dark' ? Sun03Icon : Moon02Icon} size={20} />
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </MenuItem>
            </MenuPopup>
        </Menu>
    );
}

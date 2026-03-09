import { HugeiconsIcon } from '@hugeicons/react';
import Moon02Icon from '@merchbaseco/icons/core-solid-rounded/Moon02Icon';
import MoreVerticalIcon from '@merchbaseco/icons/core-solid-rounded/MoreVerticalIcon';
import Sun03Icon from '@merchbaseco/icons/core-solid-rounded/Sun03Icon';
import DatabaseSync01Icon from '@merchbaseco/icons/core-stroke-rounded/DatabaseSync01Icon';
import Key01Icon from '@merchbaseco/icons/core-stroke-rounded/Key01Icon';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/trpc';
import { cn } from '../lib/utils';
import { syncAccountsInProgressAtom } from '../routes/atoms';
import { useTheme } from '../routes/hooks/use-theme';
import { Button, buttonVariants } from './ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from './ui/dialog';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './ui/menu';

export function MoreMenu() {
    const utils = api.useUtils();
    const isSyncing = useAtomValue(syncAccountsInProgressAtom);
    const setIsSyncing = useSetAtom(syncAccountsInProgressAtom);
    const { theme, toggleTheme } = useTheme();
    const [apiKeyOpen, setApiKeyOpen] = useState(false);
    const [apiKeyValue, setApiKeyValue] = useState<string | null>(null);
    const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
    const [apiKeyCopied, setApiKeyCopied] = useState(false);

    const { data: accounts = [] } = api.accounts.list.useQuery();
    const accountIds = useMemo(() => {
        const unique = new Set(accounts.map(account => account.adsAccountId));
        return Array.from(unique);
    }, [accounts]);

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

    const apiKeyMutation = api.apiKeys.create.useMutation({
        onError: err => {
            toast.error('API key creation failed', {
                description: err.message || 'Unable to generate an API key',
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

    const handleApiKeyOpenChange = (open: boolean) => {
        setApiKeyOpen(open);
        if (!open) {
            setApiKeyValue(null);
            setApiKeyCopied(false);
        }
    };

    const handleGetApiKey = async () => {
        if (isGeneratingApiKey) {
            setApiKeyOpen(true);
            return;
        }

        setApiKeyOpen(true);
        setApiKeyValue(null);
        setApiKeyCopied(false);

        if (accountIds.length === 0) {
            toast.error('No accounts available', {
                description: 'Add or sync an advertising account before generating an API key.',
            });
            return;
        }

        setIsGeneratingApiKey(true);
        try {
            const label = `dashboard-${new Date().toISOString()}`;
            const result = await apiKeyMutation.mutateAsync({
                label,
                adsAccountIds: accountIds,
            });
            setApiKeyValue(result.apiKey);
        } finally {
            setIsGeneratingApiKey(false);
        }
    };

    const handleCopyApiKey = async () => {
        if (!apiKeyValue) {
            return;
        }
        await navigator.clipboard.writeText(apiKeyValue);
        setApiKeyCopied(true);
        toast.success('API key copied');
    };

    return (
        <>
            <Menu>
                <MenuTrigger className={cn(buttonVariants({ variant: 'secondary', size: 'icon' }))} disabled={isSyncing}>
                    <HugeiconsIcon icon={MoreVerticalIcon} size={24} />
                </MenuTrigger>
                <MenuPopup>
                    <MenuItem disabled={isGeneratingApiKey} onClick={handleGetApiKey}>
                        <HugeiconsIcon icon={Key01Icon} size={20} />
                        {isGeneratingApiKey ? 'Generating key...' : 'Get API key'}
                    </MenuItem>
                    <MenuItem disabled={isSyncing} onClick={handleSyncAccounts}>
                        <HugeiconsIcon icon={DatabaseSync01Icon} size={20} />
                        {isSyncing ? 'Syncing...' : 'Sync accounts'}
                    </MenuItem>
                    <MenuItem onClick={toggleTheme}>
                        <HugeiconsIcon icon={theme === 'dark' ? Sun03Icon : Moon02Icon} size={20} />
                        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </MenuItem>
                </MenuPopup>
            </Menu>

            <Dialog onOpenChange={handleApiKeyOpenChange} open={apiKeyOpen}>
                <DialogPopup className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Get API key</DialogTitle>
                        <DialogDescription>Copy this key now. You will not be able to retrieve it again once this dialog is closed. Generating a new key deletes any previous keys.</DialogDescription>
                    </DialogHeader>
                    <DialogPanel>
                        <div className="rounded-lg border bg-muted/50 p-4">
                            {isGeneratingApiKey ? (
                                <p className="text-muted-foreground text-sm">Generating API key...</p>
                            ) : apiKeyValue ? (
                                <pre className="overflow-auto text-sm">
                                    <code>{apiKeyValue}</code>
                                </pre>
                            ) : (
                                <p className="text-muted-foreground text-sm">No key available.</p>
                            )}
                        </div>
                    </DialogPanel>
                    <DialogFooter>
                        <Button disabled={isGeneratingApiKey} onClick={handleGetApiKey} variant="outline">
                            {isGeneratingApiKey ? 'Generating...' : 'Generate new key'}
                        </Button>
                        <Button disabled={!apiKeyValue} onClick={handleCopyApiKey} variant="outline">
                            {apiKeyCopied ? 'Copied!' : 'Copy key'}
                        </Button>
                        <Button onClick={() => handleApiKeyOpenChange(false)}>Close</Button>
                    </DialogFooter>
                </DialogPopup>
            </Dialog>
        </>
    );
}

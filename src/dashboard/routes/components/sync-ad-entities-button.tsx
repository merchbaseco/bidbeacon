import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { useAtom } from 'jotai';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../components/ui/button';
import { toastManager } from '../../components/ui/toast';
import { useAccountDatasetMetadata, useTriggerSyncAdEntities } from '../hooks/use-account-dataset-metadata';
import { useSelectedCountryCode } from '../hooks/use-selected-country-code';
import { selectedAccountIdAtom } from './account-selector/atoms';

export function SyncAdEntitiesButton() {
    const [accountId] = useAtom(selectedAccountIdAtom);
    const countryCode = useSelectedCountryCode();
    const { data: metadata, isLoading: isLoadingMetadata } = useAccountDatasetMetadata(accountId, countryCode ?? null);
    const syncMutation = useTriggerSyncAdEntities();
    const previousStatusRef = useRef<string | undefined>(undefined);

    // Show toast when sync completes (status transitions from 'syncing' to 'completed')
    useEffect(() => {
        const previousStatus = previousStatusRef.current;
        const currentStatus = metadata?.status;

        if (previousStatus === 'syncing' && currentStatus === 'completed') {
            toastManager.add({
                type: 'success',
                title: 'Ad entities synced',
                description: `Campaigns, ad groups, ads, and targets have been synced for account ${accountId}`,
                timeout: 5000,
            });
        }

        previousStatusRef.current = currentStatus;
    }, [metadata?.status, accountId]);

    // Loading state is based purely on metadata status, not mutation state
    // This ensures the button stays in loading state throughout the entire sync process
    const isSyncing = metadata?.status === 'syncing';
    const isLoading = isLoadingMetadata || isSyncing;

    const handleSync = () => {
        if (!accountId || !countryCode) {
            return;
        }
        syncMutation.mutate({ accountId, countryCode });
    };

    const formatLastSync = (timestamp: string | null | undefined): string => {
        if (!timestamp) {
            return 'Never';
        }
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    if (!accountId || !countryCode) {
        return null;
    }

    return (
        <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">
                {metadata?.status === 'syncing' ? (
                    <span className="flex items-center gap-1.5">
                        <Loader2Icon className="size-3 animate-spin" />
                        Syncing...
                    </span>
                ) : metadata?.lastSyncCompleted ? (
                    <span>Last synced: {formatLastSync(metadata.lastSyncCompleted)}</span>
                ) : (
                    <span>Never synced</span>
                )}
            </div>
            <Button onClick={handleSync} disabled={isLoading} variant="outline" size="sm" className="inline-flex items-center gap-2">
                {isLoading ? (
                    <>
                        <Loader2Icon className="size-4 animate-spin" />
                        <span>Syncing...</span>
                    </>
                ) : (
                    <>
                        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} color="currentColor" />
                        <span>Sync Entities</span>
                    </>
                )}
            </Button>
        </div>
    );
}

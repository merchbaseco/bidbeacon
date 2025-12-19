import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { useAtom } from 'jotai';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { deriveSyncStatus, useAccountDatasetMetadata, useTriggerSyncAdEntities } from '../hooks/use-account-dataset-metadata';
import { useSelectedCountryCode } from '../hooks/use-selected-country-code';
import { selectedAccountIdAtom } from './account-selector/atoms';

export function SyncAdEntitiesButton() {
    const [accountId] = useAtom(selectedAccountIdAtom);
    const countryCode = useSelectedCountryCode();
    const { data: metadata, isLoading: isLoadingMetadata } = useAccountDatasetMetadata(accountId, countryCode ?? null);
    const syncMutation = useTriggerSyncAdEntities();
    const previousStatusRef = useRef<string | undefined>(undefined);

    const currentStatus = deriveSyncStatus(metadata);

    // Show toast when sync completes (status transitions from 'syncing' to 'completed')
    useEffect(() => {
        const previousStatus = previousStatusRef.current;

        if (previousStatus === 'syncing' && currentStatus === 'completed') {
            toast.success('Ad entities synced', {
                description: `Campaigns, ad groups, ads, and targets have been synced for account ${accountId}`,
                duration: 5000,
            });
        }

        previousStatusRef.current = currentStatus;
    }, [currentStatus, accountId]);

    // Loading state is based purely on metadata status, not mutation state
    // This ensures the button stays in loading state throughout the entire sync process
    const isSyncing = currentStatus === 'syncing';
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

    const isFetchingCampaigns = metadata?.fetchingCampaigns === true;
    const isFetchingAdGroups = metadata?.fetchingAdGroups === true;
    const isFetchingAds = metadata?.fetchingAds === true;
    const isFetchingTargets = metadata?.fetchingTargets === true;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground">
                    {currentStatus === 'syncing' ? (
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
            {(isFetchingCampaigns || isFetchingAdGroups || isFetchingAds || isFetchingTargets) && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {isFetchingCampaigns && (
                        <span className="flex items-center gap-1.5">
                            <Spinner className="size-3" />
                            <span>Campaigns</span>
                            {metadata.fetchingCampaignsPollCount !== null && metadata.fetchingCampaignsPollCount > 0 && (
                                <span className="text-xs opacity-70">({metadata.fetchingCampaignsPollCount})</span>
                            )}
                        </span>
                    )}
                    {isFetchingAdGroups && (
                        <span className="flex items-center gap-1.5">
                            <Spinner className="size-3" />
                            <span>Ad Groups</span>
                            {metadata.fetchingAdGroupsPollCount !== null && metadata.fetchingAdGroupsPollCount > 0 && (
                                <span className="text-xs opacity-70">({metadata.fetchingAdGroupsPollCount})</span>
                            )}
                        </span>
                    )}
                    {isFetchingAds && (
                        <span className="flex items-center gap-1.5">
                            <Spinner className="size-3" />
                            <span>Ads</span>
                            {metadata.fetchingAdsPollCount !== null && metadata.fetchingAdsPollCount > 0 && <span className="text-xs opacity-70">({metadata.fetchingAdsPollCount})</span>}
                        </span>
                    )}
                    {isFetchingTargets && (
                        <span className="flex items-center gap-1.5">
                            <Spinner className="size-3" />
                            <span>Targets</span>
                            {metadata.fetchingTargetsPollCount !== null && metadata.fetchingTargetsPollCount > 0 && <span className="text-xs opacity-70">({metadata.fetchingTargetsPollCount})</span>}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

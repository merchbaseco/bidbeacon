import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { deriveSyncStatus, useAccountDatasetMetadata, useTriggerSyncAdEntities } from '../hooks/use-account-dataset-metadata';
import { useSelectedCountryCode } from '../hooks/use-selected-country-code';
import { selectedAccountIdAtom } from './account-selector/atoms';

type EntityRowProps = {
    label: string;
    count: number | null;
    isFetching: boolean;
    pollCount: number | null;
};

function EntityRow({ label, count, isFetching, pollCount }: EntityRowProps) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
                {isFetching ? <Spinner className="size-3" /> : <span className="size-2 rounded-full bg-emerald-500" />}
                <span className="text-xs">{label}</span>
                {isFetching && pollCount !== null && pollCount > 0 && <span className="text-[10px] text-muted-foreground opacity-70">({pollCount})</span>}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{count !== null ? count.toLocaleString() : '—'}</span>
        </div>
    );
}

function _formatLastSync(timestamp: string | null | undefined): string {
    if (!timestamp) {
        return 'Never synced';
    }
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
        return 'Last synced just now';
    } else if (diffMins < 60) {
        return `Last synced ${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
        return `Last synced ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
        return `Last synced ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
        return `Last synced ${date.toLocaleDateString()}`;
    }
}

export function AccountDataCard() {
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

    const isSyncing = currentStatus === 'syncing';
    const isLoading = isLoadingMetadata || isSyncing;

    const handleSync = () => {
        if (!accountId || !countryCode) {
            return;
        }
        syncMutation.mutate({ accountId, countryCode });
    };

    if (!accountId || !countryCode) {
        return null;
    }

    return (
        <Card className="p-3 space-y-0 gap-3">
            <div className="flex items-start justify-between pl-1 pb-1">
                <div>
                    <div className="text-sm font-medium">Account Data</div>
                </div>
                <Button onClick={handleSync} disabled={isLoading} variant="outline" size="sm">
                    {isLoading ? <Spinner /> : <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} color="currentColor" />}
                </Button>
            </div>
            <div className="divide-y px-1">
                <EntityRow label="Campaigns" count={metadata?.campaignsCount ?? null} isFetching={metadata?.fetchingCampaigns === true} pollCount={metadata?.fetchingCampaignsPollCount ?? null} />
                <EntityRow label="Ad Groups" count={metadata?.adGroupsCount ?? null} isFetching={metadata?.fetchingAdGroups === true} pollCount={metadata?.fetchingAdGroupsPollCount ?? null} />
                <EntityRow label="Ads" count={metadata?.adsCount ?? null} isFetching={metadata?.fetchingAds === true} pollCount={metadata?.fetchingAdsPollCount ?? null} />
                <EntityRow label="Targets" count={metadata?.targetsCount ?? null} isFetching={metadata?.fetchingTargets === true} pollCount={metadata?.fetchingTargetsPollCount ?? null} />
            </div>
        </Card>
    );
}

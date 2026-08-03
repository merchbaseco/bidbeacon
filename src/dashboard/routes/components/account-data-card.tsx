import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowReloadHorizontalIcon } from '@hugeicons-pro/core-solid-rounded';
import { useAtom } from 'jotai';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { useAccountDatasetMetadata } from '../hooks/use-account-dataset-metadata';
import { formatDate } from '../utils';
import { selectedAccountIdAtom, selectedCountryCodeAtom } from './account-selector/atoms';

export const AccountDataCard = () => {
    const [accountId] = useAtom(selectedAccountIdAtom);
    const [countryCode] = useAtom(selectedCountryCodeAtom);
    const { data: metadata, isLoading, isSyncing, sync } = useAccountDatasetMetadata(accountId, countryCode);
    const lastSync = metadata?.lastSyncCompleted ?? metadata?.lastSyncStarted ?? null;
    const syncLabel = lastSync ? `Last synced ${formatDate(lastSync)}` : 'Auto syncs daily';

    if (!(accountId && countryCode)) {
        return null;
    }

    const handleSync = () => {
        sync({ accountId, countryCode });
    };

    const hasNoData = !(isLoading || metadata);

    return (
        <Card className="gap-0 space-y-0 p-3 pb-1">
            <div className="flex items-start justify-between pb-1 pl-1">
                <div className="space-y-0.5">
                    <div className="font-medium text-sm">Account Data</div>
                    <div className="text-muted-foreground text-xs">{syncLabel}</div>
                </div>
                <Button disabled={isLoading || isSyncing} onClick={handleSync} size="sm" variant="outline">
                    {isLoading || isSyncing ? <Spinner className="size-3.5" /> : <HugeiconsIcon color="currentColor" icon={ArrowReloadHorizontalIcon} size={14} />}
                </Button>
            </div>
            {isLoading ? (
                <div className="flex h-[144px] items-center justify-center">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            ) : hasNoData ? (
                <div className="flex h-[144px] items-center justify-center">
                    <p className="text-muted-foreground text-sm">No account data synced yet</p>
                </div>
            ) : (
                <div className="divide-y px-1">
                    <EntityRow count={metadata?.campaignsCount ?? null} isFetching={metadata?.fetchingCampaigns === true} label="Campaigns" />
                    <EntityRow count={metadata?.adGroupsCount ?? null} isFetching={metadata?.fetchingAdGroups === true} label="Ad Groups" />
                    <EntityRow count={metadata?.adsCount ?? null} isFetching={metadata?.fetchingAds === true} label="Ads" />
                    <EntityRow count={metadata?.targetsCount ?? null} isFetching={metadata?.fetchingTargets === true} label="Targets" />
                </div>
            )}
        </Card>
    );
};

const EntityRow = ({ label, count, isFetching }: { label: string; count: number | null; isFetching: boolean }) => {
    return (
        <div className="flex h-9 items-center justify-between">
            <div className="flex items-center gap-2">
                {isFetching ? <Spinner className="-mr-0.5 -ml-0.5 size-3" /> : <span className="size-2 rounded-full bg-emerald-500" />}
                <span className="text-sm">{label}</span>
            </div>
            <span className="text-muted-foreground text-sm tabular-nums">{count !== null ? count.toLocaleString() : '—'}</span>
        </div>
    );
};

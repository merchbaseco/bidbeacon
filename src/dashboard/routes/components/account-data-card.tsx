import { HugeiconsIcon } from '@hugeicons/react';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import { useAtom } from 'jotai';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { useAccountDatasetMetadata } from '../hooks/use-account-dataset-metadata';
import { selectedAccountIdAtom, selectedCountryCodeAtom } from './account-selector/atoms';

export const AccountDataCard = () => {
    const [accountId] = useAtom(selectedAccountIdAtom);
    const [countryCode] = useAtom(selectedCountryCodeAtom);
    const { data: metadata, isLoading, isSyncing, sync } = useAccountDatasetMetadata(accountId, countryCode);

    if (!accountId || !countryCode) {
        return null;
    }

    const handleSync = () => {
        sync({ accountId, countryCode });
    };

    const hasNoData = !isLoading && !metadata;

    return (
        <Card className="p-3 pb-1 space-y-0 gap-0">
            <div className="flex items-start justify-between pl-1 pb-1">
                <div className="text-sm font-medium">Account Data</div>
                <Button onClick={handleSync} disabled={isLoading || isSyncing} variant="outline" size="sm">
                    {isLoading || isSyncing ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} color="currentColor" />}
                </Button>
            </div>
            {isLoading ? (
                <div className="flex items-center justify-center h-[144px]">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            ) : hasNoData ? (
                <div className="flex items-center justify-center h-[144px]">
                    <p className="text-sm text-muted-foreground">No account data synced yet</p>
                </div>
            ) : (
                <div className="divide-y px-1">
                    <EntityRow label="Campaigns" count={metadata?.campaignsCount ?? null} isFetching={metadata?.fetchingCampaigns === true} />
                    <EntityRow label="Ad Groups" count={metadata?.adGroupsCount ?? null} isFetching={metadata?.fetchingAdGroups === true} />
                    <EntityRow label="Ads" count={metadata?.adsCount ?? null} isFetching={metadata?.fetchingAds === true} />
                    <EntityRow label="Targets" count={metadata?.targetsCount ?? null} isFetching={metadata?.fetchingTargets === true} />
                </div>
            )}
        </Card>
    );
};

const EntityRow = ({ label, count, isFetching }: { label: string; count: number | null; isFetching: boolean }) => {
    return (
        <div className="flex items-center justify-between h-9">
            <div className="flex items-center gap-2">
                {isFetching ? <Spinner className="size-3 -ml-0.5 -mr-0.5" /> : <span className="size-2 rounded-full bg-emerald-500" />}
                <span className="text-sm">{label}</span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">{count !== null ? count.toLocaleString() : '—'}</span>
        </div>
    );
};

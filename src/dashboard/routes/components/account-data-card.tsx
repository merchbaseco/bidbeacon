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

    return (
        <Card className="p-3 pb-1 space-y-0 gap-0">
            <div className="flex items-start justify-between pl-1 pb-1">
                <div>
                    <div className="text-sm font-medium">Account Data</div>
                </div>
                <Button onClick={handleSync} disabled={isLoading || isSyncing} variant="outline" size="sm">
                    {isLoading || isSyncing ? <Spinner /> : <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} color="currentColor" />}
                </Button>
            </div>
            <div className="divide-y px-1">
                <EntityRow label="Campaigns" count={metadata?.campaignsCount ?? null} isFetching={metadata?.fetchingCampaigns === true} />
                <EntityRow label="Ad Groups" count={metadata?.adGroupsCount ?? null} isFetching={metadata?.fetchingAdGroups === true} />
                <EntityRow label="Ads" count={metadata?.adsCount ?? null} isFetching={metadata?.fetchingAds === true} />
                <EntityRow label="Targets" count={metadata?.targetsCount ?? null} isFetching={metadata?.fetchingTargets === true} />
            </div>
        </Card>
    );
};

const EntityRow = ({ label, count, isFetching }: { label: string; count: number | null; isFetching: boolean }) => {
    return (
        <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
                {isFetching ? <Spinner className="size-3 -ml-0.5 -mr-0.5" /> : <span className="size-2 rounded-full bg-emerald-500" />}
                <span className="text-sm">{label}</span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">{count !== null ? count.toLocaleString() : '—'}</span>
        </div>
    );
};

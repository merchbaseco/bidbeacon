import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowExpandIcon } from '@merchbaseco/icons/core-solid-rounded';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { DatasetHealthTracker } from './components/health-tracker';
import { ReportsTable } from './components/reports-table';
import {
    fetchListAdvertisingAccounts,
    syncAdvertiserAccounts,
    toggleAdvertiserAccount,
} from './hooks/api';

export function IndexRoute() {
    const [syncAccountsLoading, setSyncAccountsLoading] = useState(false);
    const [syncAccountsError, setSyncAccountsError] = useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

    const [advertisingAccounts, setAdvertisingAccounts] = useState<
        Array<{
            id: string;
            adsAccountId: string;
            accountName: string;
            status: string;
            countryCode: string;
            profileId: number | null;
            entityId: string | null;
            enabled: boolean;
        }>
    >([]);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [accountsError, setAccountsError] = useState<string | null>(null);
    const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

    const handleSyncAdvertiserAccounts = async () => {
        setSyncAccountsLoading(true);
        setSyncAccountsError(null);
        setSyncSuccess(null);
        try {
            await syncAdvertiserAccounts();
            setSyncSuccess('Sync advertiser accounts job queued successfully');
        } catch (err) {
            setSyncAccountsError(
                err instanceof Error ? err.message : 'Failed to sync advertiser accounts'
            );
        } finally {
            setSyncAccountsLoading(false);
        }
    };

    const handleLoadAdvertisingAccounts = async () => {
        setAccountsLoading(true);
        setAccountsError(null);
        try {
            const data = await fetchListAdvertisingAccounts();
            setAdvertisingAccounts(data);
        } catch (err) {
            setAccountsError(
                err instanceof Error ? err.message : 'Failed to load advertising accounts'
            );
        } finally {
            setAccountsLoading(false);
        }
    };

    const handleToggleAccount = async (id: string, currentEnabled: boolean) => {
        setTogglingIds(prev => new Set(prev).add(id));
        try {
            await toggleAdvertiserAccount(id, !currentEnabled);
            // Update local state optimistically
            setAdvertisingAccounts(prev =>
                prev.map(account =>
                    account.id === id ? { ...account, enabled: !currentEnabled } : account
                )
            );
        } catch (err) {
            setAccountsError(
                err instanceof Error ? err.message : 'Failed to toggle advertiser account'
            );
        } finally {
            setTogglingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    return (
        <div className="space-y-6">
            <Card className="p-4">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Amazon Ads Sync</h2>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleSyncAdvertiserAccounts}
                                disabled={syncAccountsLoading}
                                variant="outline"
                            >
                                {syncAccountsLoading ? 'Syncing...' : 'Sync Accounts'}
                            </Button>
                        </div>
                    </div>
                    {syncSuccess && <div className="text-green-600 text-sm">{syncSuccess}</div>}
                    {syncAccountsError && (
                        <div className="text-red-600 text-sm">{syncAccountsError}</div>
                    )}
                </div>
            </Card>
            <Card className="p-4">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Advertising Accounts</h2>
                        <Button onClick={handleLoadAdvertisingAccounts} disabled={accountsLoading}>
                            {accountsLoading ? 'Loading...' : 'Load Accounts'}
                        </Button>
                    </div>
                    {accountsError && <div className="text-red-600 text-sm">{accountsError}</div>}
                    {advertisingAccounts.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-sm font-medium">
                                Found {advertisingAccounts.length} account
                                {advertisingAccounts.length !== 1 ? 's' : ''}
                            </div>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {advertisingAccounts.map(account => (
                                    <div
                                        key={account.id}
                                        className="p-3 border rounded-lg text-sm space-y-1"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 space-y-1">
                                                <div className="font-medium">
                                                    Account ID: {account.adsAccountId}
                                                </div>
                                                <div>Name: {account.accountName}</div>
                                                <div>Status: {account.status}</div>
                                                <div>Country: {account.countryCode}</div>
                                                {account.profileId && (
                                                    <div>Profile ID: {account.profileId}</div>
                                                )}
                                                {account.entityId && (
                                                    <div>Entity ID: {account.entityId}</div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    {account.enabled ? 'Enabled' : 'Disabled'}
                                                </span>
                                                <Switch
                                                    checked={account.enabled}
                                                    onCheckedChange={() =>
                                                        handleToggleAccount(
                                                            account.id,
                                                            account.enabled
                                                        )
                                                    }
                                                    disabled={togglingIds.has(account.id)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Card>
            <div className="space-y-4">
                <Card className="p-3 space-y-0 gap-3">
                    <div className="flex items-start justify-between px-2">
                        <div className="text-sm font-medium">Daily Dataset Health</div>
                        <HugeiconsIcon icon={ArrowExpandIcon} size={20} color="currentColor" />
                    </div>
                    <DatasetHealthTracker aggregation="daily" />
                </Card>
                <Card className="p-3 space-y-0 gap-3">
                    <div className="flex items-start justify-between px-2">
                        <div className="text-sm font-medium">Hourly Dataset Health</div>
                        <HugeiconsIcon icon={ArrowExpandIcon} size={20} color="currentColor" />
                    </div>
                    <DatasetHealthTracker aggregation="hourly" />
                </Card>
            </div>
            <ReportsTable />
        </div>
    );
}

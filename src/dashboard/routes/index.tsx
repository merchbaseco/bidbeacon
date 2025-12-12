import { HugeiconsIcon } from '@hugeicons/react';
import ArrowExpandIcon from '@merchbaseco/icons/core-solid-rounded/ArrowExpandIcon';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { AdvertisingAccountManager } from './components/advertising-account-manager';
import { DatasetHealthTracker } from './components/health-tracker';
import { ReportsTable } from './components/reports-table';
import { syncAdvertiserAccounts } from './hooks/api';

export function IndexRoute() {
    const [syncAccountsLoading, setSyncAccountsLoading] = useState(false);
    const [syncAccountsError, setSyncAccountsError] = useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

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

    return (
        <div className="space-y-6">
            <AdvertisingAccountManager />

            {/* Sync Accounts Card */}
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

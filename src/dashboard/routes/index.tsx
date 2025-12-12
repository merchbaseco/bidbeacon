import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowExpandIcon } from '@merchbaseco/icons/core-solid-rounded';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { DatasetHealthTracker } from './components/health-tracker';
import { ReportsTable } from './components/reports-table';
import {
    fetchListAdvertisingAccounts,
    fetchListProfiles,
    syncAdvertiserAccounts,
    syncProfiles,
} from './hooks/api';

export function IndexRoute() {
    const [syncProfilesLoading, setSyncProfilesLoading] = useState(false);
    const [syncProfilesError, setSyncProfilesError] = useState<string | null>(null);
    const [syncAccountsLoading, setSyncAccountsLoading] = useState(false);
    const [syncAccountsError, setSyncAccountsError] = useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

    const [profiles, setProfiles] = useState<
        Array<{
            profileId: number;
            countryCode: string;
            currencyCode: string;
            dailyBudget: number | null;
            timezone: string;
            marketplaceStringId: string;
            accountId: string;
            accountType: string;
            accountName: string;
            validPaymentMethod: boolean;
        }>
    >([]);
    const [profilesLoading, setProfilesLoading] = useState(false);
    const [profilesError, setProfilesError] = useState<string | null>(null);

    const [advertisingAccounts, setAdvertisingAccounts] = useState<
        Array<{
            adsAccountId: string;
            accountName: string;
            status: string;
            alternateIds: Array<{
                countryCode: string;
                entityId?: string;
                profileId?: number;
            }>;
            countryCodes: string[];
        }>
    >([]);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [accountsError, setAccountsError] = useState<string | null>(null);

    const handleSyncProfiles = async () => {
        setSyncProfilesLoading(true);
        setSyncProfilesError(null);
        setSyncSuccess(null);
        try {
            await syncProfiles();
            setSyncSuccess('Sync profiles job queued successfully');
        } catch (err) {
            setSyncProfilesError(err instanceof Error ? err.message : 'Failed to sync profiles');
        } finally {
            setSyncProfilesLoading(false);
        }
    };

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

    const handleLoadProfiles = async () => {
        setProfilesLoading(true);
        setProfilesError(null);
        try {
            const data = await fetchListProfiles();
            setProfiles(data);
        } catch (err) {
            setProfilesError(err instanceof Error ? err.message : 'Failed to load profiles');
        } finally {
            setProfilesLoading(false);
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

    return (
        <div className="space-y-6">
            <Card className="p-4">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Amazon Ads Sync</h2>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleSyncProfiles}
                                disabled={syncProfilesLoading}
                                variant="outline"
                            >
                                {syncProfilesLoading ? 'Syncing...' : 'Sync Profiles'}
                            </Button>
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
                    {syncProfilesError && (
                        <div className="text-red-600 text-sm">{syncProfilesError}</div>
                    )}
                    {syncAccountsError && (
                        <div className="text-red-600 text-sm">{syncAccountsError}</div>
                    )}
                </div>
            </Card>
            <Card className="p-4">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Profiles</h2>
                        <Button onClick={handleLoadProfiles} disabled={profilesLoading}>
                            {profilesLoading ? 'Loading...' : 'Load Profiles'}
                        </Button>
                    </div>
                    {profilesError && <div className="text-red-600 text-sm">{profilesError}</div>}
                    {profiles.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-sm font-medium">
                                Found {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
                            </div>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {profiles.map(profile => (
                                    <div
                                        key={profile.profileId}
                                        className="p-3 border rounded-lg text-sm space-y-1"
                                    >
                                        <div className="font-medium">
                                            Profile ID: {profile.profileId}
                                        </div>
                                        <div>Country: {profile.countryCode}</div>
                                        <div>Currency: {profile.currencyCode}</div>
                                        <div>Timezone: {profile.timezone}</div>
                                        {profile.dailyBudget && (
                                            <div>Daily Budget: {profile.dailyBudget}</div>
                                        )}
                                        <div className="pt-2 border-t">
                                            <div>Account: {profile.accountName}</div>
                                            <div>Type: {profile.accountType}</div>
                                            <div>Marketplace: {profile.marketplaceStringId}</div>
                                            <div>
                                                Valid Payment:{' '}
                                                {profile.validPaymentMethod ? 'Yes' : 'No'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
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
                                        key={account.adsAccountId}
                                        className="p-3 border rounded-lg text-sm space-y-1"
                                    >
                                        <div className="font-medium">
                                            Account ID: {account.adsAccountId}
                                        </div>
                                        <div>Name: {account.accountName}</div>
                                        <div>Status: {account.status}</div>
                                        <div>Countries: {account.countryCodes.join(', ')}</div>
                                        {account.alternateIds.length > 0 && (
                                            <div className="pt-2 border-t">
                                                <div className="font-medium">Alternate IDs:</div>
                                                {account.alternateIds.map(alt => {
                                                    const key = `${alt.countryCode}-${alt.profileId ?? ''}-${alt.entityId ?? ''}`;
                                                    return (
                                                        <div key={key} className="pl-2 text-xs">
                                                            {alt.countryCode}:{' '}
                                                            {alt.profileId &&
                                                                `Profile ${alt.profileId}`}
                                                            {alt.profileId && alt.entityId && ', '}
                                                            {alt.entityId &&
                                                                `Entity ${alt.entityId}`}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
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

import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowExpandIcon } from '@merchbaseco/icons/core-solid-rounded';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { DatasetHealthTracker } from './components/health-tracker';
import { ReportsTable } from './components/reports-table';
import { fetchListProfiles } from './hooks/api';

export function IndexRoute() {
    const [profiles, setProfiles] = useState<
        Array<{
            profileId: number;
            countryCode: string;
            currencyCode: string;
            dailyBudget?: number;
            timezone: string;
            accountInfo: {
                marketplaceStringId: string;
                id: string;
                type: 'vendor' | 'seller' | 'agency';
                name: string;
                subType?: 'KDP_AUTHOR' | 'AMAZON_ATTRIBUTION';
                validPaymentMethod?: boolean;
            };
        }>
    >([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleListProfiles = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchListProfiles();
            setProfiles(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch profiles');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="p-4">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Amazon Ads Profiles</h2>
                        <Button onClick={handleListProfiles} disabled={loading}>
                            {loading ? 'Loading...' : 'List Profiles'}
                        </Button>
                    </div>
                    {error && <div className="text-red-600 text-sm">{error}</div>}
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
                                            <div>Account: {profile.accountInfo.name}</div>
                                            <div>Type: {profile.accountInfo.type}</div>
                                            <div>
                                                Marketplace:{' '}
                                                {profile.accountInfo.marketplaceStringId}
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

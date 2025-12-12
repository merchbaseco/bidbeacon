import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../../../components/ui/card';
import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { fetchListAdvertisingAccounts, toggleAdvertiserAccount } from '../hooks/api';

export function AdvertisingAccountManager() {
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
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [selectedAccountRowId, setSelectedAccountRowId] = useState<string>('');
    const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

    const handleLoadAdvertisingAccounts = useCallback(async () => {
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
    }, []);

    // Load accounts on mount
    useEffect(() => {
        handleLoadAdvertisingAccounts();
    }, [handleLoadAdvertisingAccounts]);

    // Get unique account IDs
    const uniqueAccountIds = useMemo(() => {
        const accountIds = new Set(advertisingAccounts.map(acc => acc.adsAccountId));
        return Array.from(accountIds).sort();
    }, [advertisingAccounts]);

    // Get account rows for selected account ID
    const accountRowsForSelectedAccount = useMemo(() => {
        if (!selectedAccountId) return [];
        return advertisingAccounts
            .filter(acc => acc.adsAccountId === selectedAccountId)
            .sort((a, b) => {
                // Sort by country code, then profileId, then entityId
                if (a.countryCode !== b.countryCode) {
                    return a.countryCode.localeCompare(b.countryCode);
                }
                if (a.profileId !== b.profileId) {
                    if (a.profileId === null) return 1;
                    if (b.profileId === null) return -1;
                    return a.profileId - b.profileId;
                }
                if (a.entityId !== b.entityId) {
                    if (a.entityId === null) return 1;
                    if (b.entityId === null) return -1;
                    return (a.entityId || '').localeCompare(b.entityId || '');
                }
                return 0;
            });
    }, [advertisingAccounts, selectedAccountId]);

    // Get selected account row
    const selectedAccountRow = useMemo(() => {
        return advertisingAccounts.find(acc => acc.id === selectedAccountRowId);
    }, [advertisingAccounts, selectedAccountRowId]);

    // Update selected account row when account ID changes
    useEffect(() => {
        if (selectedAccountId && accountRowsForSelectedAccount.length > 0) {
            // Auto-select first row if available
            if (
                !selectedAccountRowId ||
                !accountRowsForSelectedAccount.find(acc => acc.id === selectedAccountRowId)
            ) {
                setSelectedAccountRowId(accountRowsForSelectedAccount[0].id);
            }
        } else {
            setSelectedAccountRowId('');
        }
    }, [selectedAccountId, accountRowsForSelectedAccount, selectedAccountRowId]);

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

    // Format label for country/profile combination
    const formatAccountRowLabel = (account: {
        countryCode: string;
        profileId: number | null;
        entityId: string | null;
    }) => {
        const parts = [account.countryCode];
        if (account.profileId !== null) {
            parts.push(`Profile ${account.profileId}`);
        }
        if (account.entityId !== null) {
            parts.push(`Entity ${account.entityId}`);
        }
        return parts.join(' - ');
    };

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-1">Account ID</div>
                        <Select
                            value={selectedAccountId}
                            onValueChange={setSelectedAccountId}
                            disabled={accountsLoading || advertisingAccounts.length === 0}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select an account" />
                            </SelectTrigger>
                            <SelectPopup>
                                {uniqueAccountIds.map(accountId => (
                                    <SelectItem key={accountId} value={accountId}>
                                        {accountId}
                                    </SelectItem>
                                ))}
                            </SelectPopup>
                        </Select>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-1">Country / Profile</div>
                        <Select
                            value={selectedAccountRowId}
                            onValueChange={setSelectedAccountRowId}
                            disabled={
                                accountsLoading ||
                                !selectedAccountId ||
                                accountRowsForSelectedAccount.length === 0
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select country/profile" />
                            </SelectTrigger>
                            <SelectPopup>
                                {accountRowsForSelectedAccount.map(account => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {formatAccountRowLabel(account)}
                                    </SelectItem>
                                ))}
                            </SelectPopup>
                        </Select>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {selectedAccountRow && (
                        <>
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Status</div>
                                <div className="text-sm font-medium">
                                    {selectedAccountRow.enabled ? 'Enabled' : 'Disabled'}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pt-6">
                                <Switch
                                    checked={selectedAccountRow.enabled}
                                    onCheckedChange={() =>
                                        handleToggleAccount(
                                            selectedAccountRow.id,
                                            selectedAccountRow.enabled
                                        )
                                    }
                                    disabled={togglingIds.has(selectedAccountRow.id)}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
            {accountsError && <div className="text-red-600 text-sm mt-2">{accountsError}</div>}
        </Card>
    );
}

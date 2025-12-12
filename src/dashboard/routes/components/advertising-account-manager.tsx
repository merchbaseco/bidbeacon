import { HugeiconsIcon } from '@hugeicons/react';
import AlertCircleIcon from '@merchbaseco/icons/core-solid-rounded/AlertCircleIcon';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Switch } from '../../components/ui/switch';
import {
    useAdvertisingAccounts,
    useToggleAdvertisingAccount,
} from '../hooks/use-advertising-accounts';
import { AccountIdSelect } from './account-id-select';
import { CountryProfileSelect } from './country-profile-select';

export function AdvertisingAccountManager() {
    const { data: accounts = [], isLoading, error } = useAdvertisingAccounts();
    const toggleMutation = useToggleAdvertisingAccount();
    const [accountId, setAccountId] = useState<string>('');
    const [rowId, setRowId] = useState<string>('');

    const accountIds = useMemo(
        () => [...new Set(accounts.map(a => a.adsAccountId))].sort(),
        [accounts]
    );

    const rows = useMemo(
        () =>
            accountId
                ? accounts
                      .filter(a => a.adsAccountId === accountId)
                      .sort((a, b) => a.countryCode.localeCompare(b.countryCode))
                : [],
        [accounts, accountId]
    );

    const selectedRow = accounts.find(a => a.id === rowId);

    useEffect(() => {
        setRowId(rows[0]?.id || '');
    }, [rows]);

    return (
        <>
            {error && (
                <Alert variant="error">
                    <HugeiconsIcon icon={AlertCircleIcon} size={20} color="currentColor" />
                    <AlertTitle>Failed to load accounts</AlertTitle>
                    <AlertDescription>
                        {error instanceof Error
                            ? error.message
                            : 'Unable to fetch advertising accounts. Please try again later.'}
                    </AlertDescription>
                </Alert>
            )}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                    <AccountIdSelect
                        value={accountId}
                        onValueChange={setAccountId}
                        accountIds={accountIds}
                        disabled={isLoading || !accounts.length}
                    />
                    <CountryProfileSelect
                        value={rowId}
                        onValueChange={setRowId}
                        rows={rows}
                        disabled={isLoading || !accountId || !rows.length}
                    />
                </div>
                {selectedRow && (
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-xs text-muted-foreground mb-1">Status</div>
                            <div className="text-sm font-medium">
                                {selectedRow.enabled ? 'Enabled' : 'Disabled'}
                            </div>
                        </div>
                        <div className="pt-6">
                            <Switch
                                checked={selectedRow.enabled}
                                onCheckedChange={() =>
                                    toggleMutation.mutate({
                                        id: selectedRow.id,
                                        enabled: !selectedRow.enabled,
                                    })
                                }
                                disabled={toggleMutation.isPending}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

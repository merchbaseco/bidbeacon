import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import {
    useAdvertisingAccounts,
    useToggleAdvertisingAccount,
} from '../hooks/use-advertising-accounts';

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

    const formatLabel = (a: {
        countryCode: string;
        profileId: number | null;
        entityId: string | null;
    }) =>
        [
            a.countryCode,
            a.profileId && `Profile ${a.profileId}`,
            a.entityId && `Entity ${a.entityId}`,
        ]
            .filter(Boolean)
            .join(' - ');

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-1">Account ID</div>
                        <Select
                            value={accountId}
                            onValueChange={v => v && setAccountId(v)}
                            disabled={isLoading || !accounts.length}
                        >
                            <SelectTrigger>
                                <SelectValue>{v => v || 'Select an account'}</SelectValue>
                            </SelectTrigger>
                            <SelectPopup>
                                {accountIds.map(id => (
                                    <SelectItem key={id} value={id}>
                                        {id}
                                    </SelectItem>
                                ))}
                            </SelectPopup>
                        </Select>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-1">Country / Profile</div>
                        <Select
                            value={rowId}
                            onValueChange={v => v && setRowId(v)}
                            disabled={isLoading || !accountId || !rows.length}
                        >
                            <SelectTrigger>
                                <SelectValue>
                                    {v => {
                                        const row = rows.find(r => r.id === v);
                                        return row ? formatLabel(row) : 'Select country/profile';
                                    }}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectPopup>
                                {rows.map(row => (
                                    <SelectItem key={row.id} value={row.id}>
                                        {formatLabel(row)}
                                    </SelectItem>
                                ))}
                            </SelectPopup>
                        </Select>
                    </div>
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
            {error && (
                <div className="text-red-600 text-sm mt-2">
                    {error instanceof Error ? error.message : 'Failed to load accounts'}
                </div>
            )}
        </Card>
    );
}

import { useAtom } from 'jotai';
import { useMemo } from 'react';
import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import { useAdvertisingAccounts } from '../../hooks/use-advertising-accounts';
import { selectedAccountIdAtom } from './atoms';

export function AccountIdSelect({ disabled }: { disabled?: boolean }) {
    const { data: accounts = [], isLoading } = useAdvertisingAccounts();
    const [accountId, setAccountId] = useAtom(selectedAccountIdAtom);

    const accountOptions = useMemo(() => {
        const accountMap = new Map<string, string>();
        accounts.forEach(a => {
            if (!accountMap.has(a.adsAccountId)) {
                accountMap.set(a.adsAccountId, a.accountName);
            }
        });
        return Array.from(accountMap.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [accounts]);

    const selectedAccount = accountOptions.find(a => a.id === accountId);

    return (
        <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">Account ID</div>
            <Select
                value={accountId}
                onValueChange={v => v && setAccountId(v)}
                disabled={disabled || isLoading || !accounts.length}
            >
                <SelectTrigger>
                    <SelectValue>{_v => selectedAccount?.name || 'Select an account'}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {accountOptions.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                            {account.name}
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
        </div>
    );
}

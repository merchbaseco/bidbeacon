import { HugeiconsIcon } from '@hugeicons/react';
import AlertCircleIcon from '@merchbaseco/icons/core-solid-rounded/AlertCircleIcon';
import { useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { useAdvertisingAccounts } from '../../hooks/use-advertising-accounts';
import { selectedAccountIdAtom, selectedProfileIdAtom } from './atoms';

export function AccountSelector() {
    const { data: accounts = [], isLoading, error } = useAdvertisingAccounts();
    const [accountId, setAccountId] = useAtom(selectedAccountIdAtom);
    const [profileId, setProfileId] = useAtom(selectedProfileIdAtom);

    const selectOptions = useMemo(() => {
        return accounts
            .filter(a => a.profileId !== null)
            .map(account => ({
                ...account,
                value: `${account.adsAccountId}:${account.profileId}`,
            }))
            .sort((a, b) => {
                const nameCompare = a.accountName.localeCompare(b.accountName);
                return nameCompare !== 0 ? nameCompare : a.countryCode.localeCompare(b.countryCode);
            });
    }, [accounts]);

    const selectedRow = accounts.find(a => a.adsAccountId === accountId && a.profileId === profileId);
    const selectedValue = accountId && profileId ? `${accountId}:${profileId}` : '';

    useEffect(() => {
        if (accounts.length > 0 && !accountId) {
            const firstAccount = accounts.find(a => a.profileId !== null);
            if (firstAccount?.profileId) {
                setAccountId(firstAccount.adsAccountId);
                setProfileId(firstAccount.profileId);
            }
        }
    }, [accounts, accountId, setAccountId, setProfileId]);

    const handleValueChange = (value: string | null) => {
        if (!value) return;
        const [adsAccountId, profileId] = value.split(':');
        if (adsAccountId && profileId) {
            setAccountId(adsAccountId);
            setProfileId(profileId);
        }
    };

    return (
        <>
            {error && (
                <Alert variant="error">
                    <HugeiconsIcon icon={AlertCircleIcon} size={20} color="currentColor" />
                    <AlertTitle>Failed to load accounts</AlertTitle>
                    <AlertDescription>{error instanceof Error ? error.message : 'Unable to fetch advertising accounts. Please try again later.'}</AlertDescription>
                </Alert>
            )}
            <div className="flex items-center justify-between gap-4">
                <Select value={selectedValue} onValueChange={handleValueChange} disabled={isLoading || !selectOptions.length}>
                    <SelectTrigger className="w-[300px]">
                        <SelectValue>
                            {_v =>
                                selectedRow ? (
                                    <span className="flex items-center gap-1 font-mono text-sm">
                                        <span>{selectedRow.accountName}</span>
                                        <span className="bg-muted rounded-sm px-1 py-0.5 inline-flex">{selectedRow.countryCode}</span>
                                    </span>
                                ) : (
                                    'Select account / marketplace'
                                )
                            }
                        </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                        {selectOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                <span className="flex items-center gap-1 font-mono text-sm">
                                    <span>{option.accountName}</span>
                                    <span className="bg-muted rounded-sm px-0.5 py-px inline-flex">{option.countryCode}</span>
                                </span>
                            </SelectItem>
                        ))}
                    </SelectPopup>
                </Select>
            </div>
        </>
    );
}

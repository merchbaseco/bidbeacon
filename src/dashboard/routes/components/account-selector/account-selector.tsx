import { HugeiconsIcon } from '@hugeicons/react';
import CircleIcon from '@merchbaseco/icons/core-solid-rounded/CircleIcon';
import CircleIconStroke from '@merchbaseco/icons/core-stroke-rounded/CircleIcon';
import { useAtom } from 'jotai';
import { useEffect, useMemo, useRef } from 'react';
import { api } from '../../../lib/trpc';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { useAdvertisingAccounts } from '../../hooks/use-advertising-accounts';
import { selectedAccountIdAtom, selectedCountryCodeAtom, selectedProfileIdAtom } from './atoms';

export function AccountSelector() {
    const { data: accounts = [], isLoading, error } = useAdvertisingAccounts();
    const [accountId, setAccountId] = useAtom(selectedAccountIdAtom);
    const [profileId, setProfileId] = useAtom(selectedProfileIdAtom);
    const [, setCountryCode] = useAtom(selectedCountryCodeAtom);

    // Track if we've initialized from saved preference
    const initializedRef = useRef(false);

    // Get saved account preference
    const { data: savedAccount } = api.users.getSelectedAccount.useQuery(undefined, {
        staleTime: Infinity, // Only fetch once per session
    });

    // Mutation to save account preference
    const setSelectedAccountMutation = api.users.setSelectedAccount.useMutation();

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

    // Initialize from saved preference or auto-select first account
    useEffect(() => {
        if (initializedRef.current || accounts.length === 0 || accountId) return;

        // Try to restore saved preference
        if (savedAccount?.adsAccountId && savedAccount?.profileId) {
            const savedExists = accounts.some(
                a => a.adsAccountId === savedAccount.adsAccountId && a.profileId === savedAccount.profileId
            );
            if (savedExists) {
                const account = accounts.find(
                    a => a.adsAccountId === savedAccount.adsAccountId && a.profileId === savedAccount.profileId
                );
                if (account) {
                    setAccountId(savedAccount.adsAccountId);
                    setProfileId(savedAccount.profileId);
                    setCountryCode(account.countryCode);
                    initializedRef.current = true;
                    return;
                }
            }
        }

        // Fall back to first account
        const firstAccount = accounts.find(a => a.profileId !== null);
        if (firstAccount?.profileId) {
            setAccountId(firstAccount.adsAccountId);
            setProfileId(firstAccount.profileId);
            setCountryCode(firstAccount.countryCode);
            // Save as the new preference
            setSelectedAccountMutation.mutate({
                adsAccountId: firstAccount.adsAccountId,
                profileId: firstAccount.profileId,
            });
        }
        initializedRef.current = true;
    }, [accounts, accountId, savedAccount, setAccountId, setProfileId, setCountryCode, setSelectedAccountMutation]);

    useEffect(() => {
        if (accountId && profileId && accounts.length > 0) {
            const selectedAccount = accounts.find(a => a.adsAccountId === accountId && a.profileId === profileId);
            if (selectedAccount) {
                setCountryCode(selectedAccount.countryCode);
            }
        }
    }, [accountId, profileId, accounts, setCountryCode]);

    const handleValueChange = (value: string | null) => {
        if (!value) return;
        const [adsAccountId, newProfileId] = value.split(':');
        if (adsAccountId && newProfileId) {
            const selectedAccount = accounts.find(a => a.adsAccountId === adsAccountId && a.profileId === newProfileId);
            setAccountId(adsAccountId);
            setProfileId(newProfileId);
            if (selectedAccount) {
                setCountryCode(selectedAccount.countryCode);
            }
            // Persist the selection
            setSelectedAccountMutation.mutate({
                adsAccountId,
                profileId: newProfileId,
            });
        }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <Select value={selectedValue} onValueChange={handleValueChange} disabled={isLoading || !!error || !selectOptions.length}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue>
                        {_v =>
                            selectedRow ? (
                                <span className="flex items-center gap-1 font-mono text-sm">
                                    <span>{selectedRow.accountName}</span>
                                    <span className="bg-muted rounded-sm px-1 py-0.5 inline-flex">{selectedRow.countryCode}</span>
                                </span>
                            ) : (
                                <div className="text-muted-foreground font-mono text-sm py-0.5">Select account / marketplace</div>
                            )
                        }
                    </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {selectOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                            <span className="flex items-center gap-2 font-mono text-sm">
                                <HugeiconsIcon
                                    icon={option.enabled ? CircleIcon : CircleIconStroke}
                                    size={16}
                                    className={option.enabled ? 'text-green-600 dark:text-green-500' : 'text-neutral-400 dark:text-neutral-500'}
                                />
                                <span>{option.accountName}</span>
                                <span className="bg-muted rounded-sm px-0.5 py-px inline-flex">{option.countryCode}</span>
                            </span>
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
        </div>
    );
}

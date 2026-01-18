import { useAtom } from 'jotai';
import { useEffect, useMemo, useRef } from 'react';
import { api } from '../../lib/trpc';
import { useAdvertisingAccounts } from './use-advertising-accounts';
import { selectedAccountIdAtom, selectedCountryCodeAtom, selectedProfileIdAtom } from '../components/account-selector/atoms';

export const useSelectedAccount = () => {
    const { data: accounts = [], isLoading, error } = useAdvertisingAccounts();
    const [accountId, setAccountId] = useAtom(selectedAccountIdAtom);
    const [profileId, setProfileId] = useAtom(selectedProfileIdAtom);
    const [countryCode, setCountryCode] = useAtom(selectedCountryCodeAtom);
    const initializedRef = useRef(false);

    const { data: savedAccount, isFetched: isSavedAccountFetched } = api.users.getSelectedAccount.useQuery(undefined, {
        staleTime: Infinity,
    });

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

    useEffect(() => {
        if (initializedRef.current || accounts.length === 0 || accountId || !isSavedAccountFetched) return;

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

        const firstAccount = accounts.find(a => a.profileId !== null);
        if (firstAccount?.profileId) {
            setAccountId(firstAccount.adsAccountId);
            setProfileId(firstAccount.profileId);
            setCountryCode(firstAccount.countryCode);
            const shouldPersistFallback =
                savedAccount === null || Boolean(savedAccount?.adsAccountId && savedAccount?.profileId);
            if (shouldPersistFallback) {
                setSelectedAccountMutation.mutate({
                    adsAccountId: firstAccount.adsAccountId,
                    profileId: firstAccount.profileId,
                });
            }
        }
        initializedRef.current = true;
    }, [
        accounts,
        accountId,
        savedAccount,
        isSavedAccountFetched,
        setAccountId,
        setProfileId,
        setCountryCode,
        setSelectedAccountMutation,
    ]);

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
            setSelectedAccountMutation.mutate({
                adsAccountId,
                profileId: newProfileId,
            });
        }
    };

    return {
        accounts,
        accountId,
        profileId,
        countryCode,
        isLoading,
        error,
        selectOptions,
        selectedRow,
        selectedValue,
        handleValueChange,
    };
};

import { useAtomValue } from 'jotai';
import { api } from '../../lib/trpc';
import { useAdvertisingAccounts } from './use-advertising-accounts';
import { selectedAccountIdAtom } from '../components/account-selector/atoms';

export const useAccountSelectionState = () => {
    const accountId = useAtomValue(selectedAccountIdAtom);
    const { data: accounts = [], isLoading: isAccountsLoading } = useAdvertisingAccounts();
    const { isFetched: isSavedAccountFetched } = api.users.getSelectedAccount.useQuery(undefined, {
        staleTime: Infinity,
        enabled: !accountId,
    });

    const hasSelectableAccounts = accounts.some(account => account.profileId !== null);
    const isSelectionPending = !accountId && (isAccountsLoading || !isSavedAccountFetched || hasSelectableAccounts);

    return {
        accountId: accountId || null,
        isSelectionPending,
    };
};

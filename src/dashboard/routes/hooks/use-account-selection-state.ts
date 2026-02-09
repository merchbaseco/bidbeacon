import { useAtomValue } from 'jotai';
import { api } from '../../lib/trpc';
import { selectedAccountIdAtom } from '../components/account-selector/atoms';
import { useAdvertisingAccounts } from './use-advertising-accounts';

export const useAccountSelectionState = () => {
    const accountId = useAtomValue(selectedAccountIdAtom);
    const { data: accounts = [], isLoading: isAccountsLoading } = useAdvertisingAccounts();
    const { isFetched: isSavedAccountFetched } = api.users.getSelectedAccount.useQuery(undefined, {
        staleTime: Number.POSITIVE_INFINITY,
        enabled: !accountId,
    });

    const hasSelectableAccounts = accounts.some(account => account.profileId !== null);
    const isSelectionPending = !accountId && (isAccountsLoading || !isSavedAccountFetched || hasSelectableAccounts);

    return {
        accountId: accountId || null,
        isSelectionPending,
    };
};

import { useAtomValue } from 'jotai';
import { selectedAccountIdAtom } from '../components/account-selector/atoms';

export const useSelectedAccountId = (): string | null => {
    const accountId = useAtomValue(selectedAccountIdAtom);
    return accountId || null;
};

import { useAtomValue } from 'jotai';
import { selectedAccountIdAtom } from '../components/account-selector/atoms';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';
export const useSelectedAccountId = () => {
    const accountId = useAtomValue(selectedAccountIdAtom);
    return accountId || DEFAULT_ACCOUNT_ID;
};

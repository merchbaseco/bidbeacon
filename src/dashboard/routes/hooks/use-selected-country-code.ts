import { useAtomValue } from 'jotai';
import { selectedAccountIdAtom, selectedProfileIdAtom } from '../components/account-selector/atoms';
import { useAdvertisingAccounts } from './use-advertising-accounts';

export const useSelectedCountryCode = (): string | undefined => {
    const { data: accounts = [] } = useAdvertisingAccounts();
    const accountId = useAtomValue(selectedAccountIdAtom);
    const profileId = useAtomValue(selectedProfileIdAtom);

    const selectedAccount = accounts.find(a => a.adsAccountId === accountId && a.profileId === profileId);
    return selectedAccount?.countryCode;
};

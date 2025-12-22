import { useAtomValue } from 'jotai';
import { selectedCountryCodeAtom } from '../components/account-selector/atoms';

export const useSelectedCountryCode = (): string => {
    const countryCode = useAtomValue(selectedCountryCodeAtom);
    return countryCode;
};

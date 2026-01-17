import { atom } from 'jotai';

// Don't persist to localStorage - selection is per-session to avoid cross-user state issues
// When user logs in, the account selector will auto-select the first available account
export const selectedAccountIdAtom = atom<string>('');
export const selectedProfileIdAtom = atom<string>('');
export const selectedCountryCodeAtom = atom<string>('');

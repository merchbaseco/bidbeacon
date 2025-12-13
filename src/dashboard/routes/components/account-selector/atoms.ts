import { atomWithStorage } from 'jotai/utils';

export const selectedAccountIdAtom = atomWithStorage<string>('bidbeacon.selectedAccountId', '');
export const selectedProfileIdAtom = atomWithStorage<string>('bidbeacon.selectedProfileId', '');

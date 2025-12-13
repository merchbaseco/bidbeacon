import { atom } from 'jotai';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export const connectionStatusAtom = atom<ConnectionStatus>('disconnected');

export const syncAccountsInProgressAtom = atom<boolean>(false);

// Global storage for loading toast IDs, keyed by utility name
export const loadingToastsAtom = atom<Record<string, string>>({});

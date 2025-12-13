import { atom } from 'jotai';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export const connectionStatusAtom = atom<ConnectionStatus>('disconnected');

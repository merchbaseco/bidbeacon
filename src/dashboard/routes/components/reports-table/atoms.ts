import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const aggregationAtom = atomWithStorage<'daily' | 'hourly'>('bidbeacon.reportsTable.aggregation', 'daily');
export const entityTypeAtom = atomWithStorage<'target' | 'product'>('bidbeacon.reportsTable.entityType', 'target');
export const statusFilterAtom = atomWithStorage<string>('bidbeacon.reportsTable.statusFilter', 'all');
export const limitAtom = atom<number>(10);
export const offsetAtom = atom<number>(0);


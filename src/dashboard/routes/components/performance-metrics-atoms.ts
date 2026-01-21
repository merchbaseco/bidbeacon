import { atom } from 'jotai';
import type { PerformanceRange } from './performance-metrics-config';

export type PerformanceEntityFilter = {
    type: 'campaign' | 'ad' | 'target';
    id: string;
    label: string;
    description?: string | null;
};

const performanceRangeAtom = atom<PerformanceRange>('today');
const customRangeAtom = atom<{ start: string; end: string } | null>(null);
const customRangeDraftAtom = atom<{ start: string; end: string }>({ start: '', end: '' });
const entityFiltersAtom = atom<PerformanceEntityFilter[]>([]);
const searchInputAtom = atom('');

export { customRangeAtom, customRangeDraftAtom, entityFiltersAtom, performanceRangeAtom, searchInputAtom };

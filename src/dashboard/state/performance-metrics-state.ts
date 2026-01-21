import { atom } from 'jotai';
import type { PerformanceRange } from '@/dashboard/routes/components/performance-metrics-config';

export type PerformanceEntityFilter = {
    type: 'campaign' | 'adGroup' | 'ad' | 'target';
    id: string;
    label: string;
    description?: string | null;
};

const performanceRangeAtom = atom<PerformanceRange>('today');
const customRangeAtom = atom<{ start: string; end: string } | null>(null);
const customRangeDraftAtom = atom<{ start: string; end: string }>({ start: '', end: '' });
const entityFiltersAtom = atom<PerformanceEntityFilter[]>([]);

export { customRangeAtom, customRangeDraftAtom, entityFiltersAtom, performanceRangeAtom };

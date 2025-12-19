import { useMemo } from 'react';
import type { ReportDatasetMetadata } from './use-report-datasets';

export function useStats(rows: ReportDatasetMetadata[]) {
    return useMemo(() => {
        const total = rows.length;
        const completed = rows.filter(row => row.status === 'completed').length;
        const error = rows.filter(row => row.status === 'error').length;
        const fetching = rows.filter(row => row.status === 'fetching').length;
        const parsing = rows.filter(row => row.status === 'parsing').length;
        const missing = rows.filter(row => row.status === 'missing').length;

        return { total, completed, error, fetching, parsing, missing };
    }, [rows]);
}

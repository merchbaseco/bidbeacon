import { useMemo } from 'react';

type ReportDatasetMetadata = {
    status: string;
    lastRefreshed: string | null;
};

export function useStats(rows: ReportDatasetMetadata[]) {
    return useMemo(() => {
        const total = rows.length;
        const completed = rows.filter(row => row.status === 'completed').length;
        const failed = rows.filter(row => row.status === 'failed').length;
        const fetching = rows.filter(row => row.status === 'fetching').length;
        const parsing = rows.filter(row => row.status === 'parsing').length;
        const missing = rows.filter(row => row.status === 'missing').length;

        const latest = rows[0];
        const lastRefreshed = latest?.lastRefreshed ?? null;

        return { total, completed, failed, fetching, parsing, missing, lastRefreshed };
    }, [rows]);
}

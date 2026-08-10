import { useMemo } from 'react';
import { api } from '@/dashboard/lib/trpc';
import type { PerformanceDimension, PerformanceTableInput } from '@/types/performance-api';

const usePerformanceTable = ({
    accountId,
    range,
    dimension,
    filters,
    enabled,
}: {
    accountId: string;
    range: PerformanceTableInput['range'];
    dimension: PerformanceDimension;
    filters?: PerformanceTableInput['filters'];
    enabled?: boolean;
}) => {
    const queryInput = useMemo(
        () => ({
            accountId,
            range,
            dimension,
            filters,
            sort: {
                field: 'spend' as const,
                direction: 'desc' as const,
            },
            pagination: {
                limit: 200,
            },
        }),
        [accountId, range, dimension, filters]
    );

    const query = api.performanceTable.table.useQuery(queryInput, {
        enabled: enabled ?? Boolean(accountId),
        placeholderData: previous => previous,
    });

    return {
        ...query,
    };
};

export { usePerformanceTable };

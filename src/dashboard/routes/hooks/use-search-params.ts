import { useNavigate, useSearchParams } from 'react-router';

type Aggregation = 'daily' | 'hourly';

export function useSearchParamsState() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const updateSearch = (
        next: Partial<{ accountId?: string; aggregation?: Aggregation; days?: number }>
    ) => {
        const newParams = new URLSearchParams(searchParams);

        if (next.accountId !== undefined) {
            if (next.accountId) {
                newParams.set('accountId', next.accountId);
            } else {
                newParams.delete('accountId');
            }
        }
        if (next.aggregation !== undefined) {
            newParams.set('aggregation', next.aggregation);
        }
        if (next.days !== undefined) {
            newParams.set('days', String(next.days));
        }

        navigate({ search: newParams.toString() }, { replace: true });
    };

    return { updateSearch };
}

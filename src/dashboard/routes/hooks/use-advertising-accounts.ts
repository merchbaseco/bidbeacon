import { useState } from 'react';
import { api } from '../../lib/trpc';

export const useAdvertisingAccounts = () => {
    const _utils = api.useUtils();
    const [_togglingAccountId, setTogglingAccountId] = useState<string | null>(null);

    const { data, isLoading, error, ...rest } = api.accounts.list.useQuery();

    const { mutate: toggle } = api.accounts.toggle.useMutation({
        onMutate: ({ adsAccountId }) => {
            setTogglingAccountId(adsAccountId);
        },
        onError: () => {
            setTogglingAccountId(null);
        },
        onSuccess: () => {
            setTogglingAccountId(null);
        },
        onSettled: () => {
            _utils.accounts.list.invalidate();
        },
    });

    return {
        data,
        isLoading,
        error,
        toggle,
        ...rest,
    };
};

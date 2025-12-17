import { api } from '../../lib/trpc.js';

export type AdvertisingAccount = {
    id: string;
    adsAccountId: string;
    accountName: string;
    status: string;
    countryCode: string;
    profileId: string | null;
    entityId: string | null;
    enabled: boolean;
};

export function useAdvertisingAccounts() {
    const { data, ...rest } = api.accounts.list.useQuery(undefined, {
        select: response => response.data,
    });

    return {
        ...rest,
        data: data as AdvertisingAccount[] | undefined,
    };
}

export function useToggleAdvertisingAccount() {
    const utils = api.useUtils();

    return api.accounts.toggle.useMutation({
        onMutate: async ({ adsAccountId, profileId, enabled }) => {
            // Cancel outgoing refetches
            await utils.accounts.list.cancel();

            // Snapshot the previous value (already selected, so it's just the array)
            const previousAccounts = utils.accounts.list.getData();

            // Optimistically update to the new value
            // Since we use select, setData receives the selected data (array), not the full response
            if (previousAccounts) {
                utils.accounts.list.setData(
                    undefined,
                    previousAccounts.map(account => (account.adsAccountId === adsAccountId && account.profileId === profileId ? { ...account, enabled } : account))
                );
            }

            // Return a context object with the snapshotted value
            return { previousAccounts };
        },
        onError: (_err, _variables, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            // previousAccounts is already the selected data (array)
            if (context?.previousAccounts !== undefined) {
                utils.accounts.list.setData(undefined, context.previousAccounts);
            }
        },
        onSettled: () => {
            // Always refetch after error or success to ensure we have the latest data
            utils.accounts.list.invalidate();
        },
    });
}

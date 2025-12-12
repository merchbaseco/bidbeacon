import { useSearchParams } from 'react-router';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';
export const useSelectedAccountId = () => {
    const [searchParams] = useSearchParams();
    return searchParams.get('accountId') ?? DEFAULT_ACCOUNT_ID;
};

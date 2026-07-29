import { createBidBeaconClient } from '@bidbeacon/http-client';
import { useAuth } from '@clerk/clerk-react';
import { apiBaseUrl } from '@/dashboard/router';

export const usePublicApiClient = () => {
    const { getToken } = useAuth();

    const getClient = async () => {
        const token = await getToken();
        return createBidBeaconClient({
            baseUrl: apiBaseUrl,
            headers: token
                ? {
                      Authorization: `Bearer ${token}`,
                  }
                : undefined,
        });
    };

    return { getClient };
};

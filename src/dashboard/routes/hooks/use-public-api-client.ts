import { createBidBeaconClient } from '@bidbeacon/http-client';
import { useAuth } from '@clerk/clerk-react';
import { apiBaseUrl } from '@/dashboard/router';

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID?.trim();

export const usePublicApiClient = () => {
    const { getToken } = useAuth();

    const getClient = async () => {
        if (DEV_USER_ID) {
            return createBidBeaconClient({
                baseUrl: apiBaseUrl,
                headers: {
                    'x-bidbeacon-dev-user-id': DEV_USER_ID,
                },
            });
        }

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

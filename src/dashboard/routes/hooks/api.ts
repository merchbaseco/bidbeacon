import { apiBaseUrl } from '../../router';

export async function fetchDashboardStatus(params: {
    accountId: string;
    aggregation: string;
    from: string;
    to: string;
}) {
    const statusUrl = new URL('/api/dashboard/status', apiBaseUrl);
    statusUrl.searchParams.set('accountId', params.accountId);
    statusUrl.searchParams.set('aggregation', params.aggregation);
    statusUrl.searchParams.set('from', params.from);
    statusUrl.searchParams.set('to', params.to);

    const response = await fetch(statusUrl);
    if (!response.ok) {
        const message = await response.text();
        throw new Error(`Failed to load dashboard status: ${response.status} ${message}`);
    }

    const body = (await response.json()) as {
        success: boolean;
        data: Array<{
            accountId: string;
            timestamp: string;
            aggregation: string;
            status: string;
            lastRefreshed: string | null;
            reportId: string;
            error: string | null;
        }>;
    };

    return body.data;
}

export async function triggerUpdate(accountId: string) {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/trigger-update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { message?: string };
}

export async function reprocessDataset(params: {
    accountId: string;
    timestamp: string;
    aggregation: string;
}) {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/reprocess`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { message?: string };
}

export async function syncProfiles() {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/sync-profiles`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { message?: string };
}

export async function syncAdvertiserAccounts() {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/sync-advertiser-accounts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { message?: string };
}

export async function fetchListProfiles() {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/list-profiles`);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list profiles: ${response.status} ${text}`);
    }

    const body = (await response.json()) as {
        success: boolean;
        data: Array<{
            profileId: number;
            countryCode: string;
            currencyCode: string;
            dailyBudget: number | null;
            timezone: string;
            marketplaceStringId: string;
            accountId: string;
            accountType: string;
            accountName: string;
            validPaymentMethod: boolean;
        }>;
    };

    return body.data;
}

export async function fetchListAdvertisingAccounts() {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/list-advertising-accounts`);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list advertising accounts: ${response.status} ${text}`);
    }

    const body = (await response.json()) as {
        success: boolean;
        data: Array<{
            adsAccountId: string;
            accountName: string;
            status: string;
            alternateIds: Array<{
                countryCode: string;
                entityId?: string;
                profileId?: number;
            }>;
            countryCodes: string[];
        }>;
    };

    return body.data;
}

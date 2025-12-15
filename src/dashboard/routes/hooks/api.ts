import { apiBaseUrl } from '../../router';

export type DashboardStatusResponse = {
    accountId: string;
    countryCode: string;
    timestamp: string;
    aggregation: 'daily' | 'hourly';
    status: string;
    lastRefreshed: string | null;
    reportId: string;
    error: string | null;
};

export async function fetchDashboardStatus(params: { accountId: string; countryCode?: string; aggregation: string; from: string; to: string }): Promise<DashboardStatusResponse[]> {
    const statusUrl = new URL('/api/dashboard/status', apiBaseUrl);
    statusUrl.searchParams.set('accountId', params.accountId);
    if (params.countryCode) {
        statusUrl.searchParams.set('countryCode', params.countryCode);
    }
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
        data: DashboardStatusResponse[];
    };

    return body.data;
}

export async function triggerUpdate(accountId: string, countryCode: string) {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/trigger-update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId, countryCode }),
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
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { message?: string };
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
            id: string;
            adsAccountId: string;
            accountName: string;
            status: string;
            countryCode: string;
            profileId: string | null;
            entityId: string | null;
            enabled: boolean;
        }>;
    };

    return body.data;
}

export async function toggleAdvertiserAccount(adsAccountId: string, profileId: string, enabled: boolean) {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/toggle-advertiser-account`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ adsAccountId, profileId, enabled }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { success: boolean; message?: string };
}

export async function createReport(params: { accountId: string; countryCode: string; timestamp: string; aggregation: 'hourly' | 'daily' }) {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/create-report`, {
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

    const body = (await response.json()) as {
        success: boolean;
        data?: unknown;
        error?: string;
    };

    if (!body.success) {
        throw new Error(body.error || 'Failed to create report');
    }

    return body.data;
}

export async function retrieveReport(params: { accountId: string; timestamp: string; aggregation: 'hourly' | 'daily' }) {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/retrieve-report`, {
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

    const body = (await response.json()) as {
        success: boolean;
        data?: unknown;
        error?: string;
    };

    if (!body.success) {
        throw new Error(body.error || 'Failed to retrieve report');
    }

    return body.data;
}

export type ApiMetricsDataPoint = {
    interval: string;
    count: number;
    avgDuration: number;
    successCount: number;
    errorCount: number;
};

export type ApiMetricsResponse = {
    success: boolean;
    data: Record<string, ApiMetricsDataPoint[]>;
    apiNames: string[];
    from: string;
    to: string;
};

export async function fetchApiMetrics(params: { from?: string; to?: string; apiName?: string }): Promise<ApiMetricsResponse> {
    const metricsUrl = new URL('/api/dashboard/api-metrics', apiBaseUrl);
    if (params.from) {
        metricsUrl.searchParams.set('from', params.from);
    }
    if (params.to) {
        metricsUrl.searchParams.set('to', params.to);
    }
    if (params.apiName) {
        metricsUrl.searchParams.set('apiName', params.apiName);
    }

    const response = await fetch(metricsUrl);
    if (!response.ok) {
        const message = await response.text();
        throw new Error(`Failed to load API metrics: ${response.status} ${message}`);
    }

    return (await response.json()) as ApiMetricsResponse;
}

export type AccountDatasetMetadata = {
    accountId: string;
    countryCode: string;
    status: 'idle' | 'syncing' | 'completed' | 'failed';
    lastSyncStarted: string | null;
    lastSyncCompleted: string | null;
    campaignsCount: number | null;
    adGroupsCount: number | null;
    adsCount: number | null;
    targetsCount: number | null;
    error: string | null;
};

export async function fetchAccountDatasetMetadata(accountId: string, countryCode: string): Promise<AccountDatasetMetadata | null> {
    const url = new URL('/api/dashboard/account-dataset-metadata', apiBaseUrl);
    url.searchParams.set('accountId', accountId);
    url.searchParams.set('countryCode', countryCode);

    const response = await fetch(url);
    if (!response.ok) {
        const message = await response.text();
        throw new Error(`Failed to load account dataset metadata: ${response.status} ${message}`);
    }

    const body = (await response.json()) as {
        success: boolean;
        data: AccountDatasetMetadata | null;
    };

    return body.data;
}

export async function triggerSyncAdEntities(accountId: string, countryCode: string) {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/trigger-sync-ad-entities`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId, countryCode }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { success: boolean; message?: string };
}

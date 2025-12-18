export const queryKeys = {
    dashboardStatus: (accountId: string, aggregation: string, days: number, countryCode?: string) => ['dashboard-status', accountId, aggregation, days, countryCode] as const,
    dashboardStatusAll: () => ['dashboard-status'] as const,
    advertisingAccounts: () => ['advertising-accounts'] as const,
    apiMetrics: (from?: string, to?: string, apiName?: string) => ['api-metrics', from, to, apiName] as const,
    jobMetrics: (from?: string, to?: string, jobName?: string) => ['job-metrics', from, to, jobName] as const,
    accountDatasetMetadata: (accountId: string, countryCode: string) => ['account-dataset-metadata', accountId, countryCode] as const,
} as const;

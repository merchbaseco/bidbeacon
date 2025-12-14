export const queryKeys = {
    dashboardStatus: (accountId: string, aggregation: string, days: number, countryCode?: string) => ['dashboard-status', accountId, aggregation, days, countryCode] as const,
    dashboardStatusAll: () => ['dashboard-status'] as const,
    advertisingAccounts: () => ['advertising-accounts'] as const,
} as const;

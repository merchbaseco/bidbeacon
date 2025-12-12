export const queryKeys = {
    dashboardStatus: (accountId: string, aggregation: string, days: number) =>
        ['dashboard-status', accountId, aggregation, days] as const,
    dashboardStatusAll: () => ['dashboard-status'] as const,
    advertisingAccounts: () => ['advertising-accounts'] as const,
} as const;

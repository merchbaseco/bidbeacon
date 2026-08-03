import { HugeiconsIcon } from '@hugeicons/react';
import { ChartBarLineIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty';
import { AccountDataCard } from './components/account-data-card';
import { AmsMetricsCard } from './components/ams-metrics-card';
import { DashboardLayout } from './components/dashboard-layout';
import { DashboardSkeleton } from './components/dashboard-skeleton';
import { EventStream } from './components/event-stream';
import { PerformanceMetrics } from './components/performance-metrics';
import { PerformanceTable } from './components/performance-table';
import { ReportsTable } from './components/reports-table/reports-table';
import { useAccountSelectionState } from './hooks/use-account-selection-state';

export function IndexRoute() {
    const { accountId, isSelectionPending } = useAccountSelectionState();

    if (isSelectionPending) {
        return <DashboardSkeleton />;
    }

    // Show empty state when no account is selected
    if (!accountId) {
        return (
            <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
                <Empty className="max-w-lg border border-border bg-card/50">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <HugeiconsIcon icon={ChartBarLineIcon} size={20} />
                        </EmptyMedia>
                        <EmptyTitle>No account selected</EmptyTitle>
                        <EmptyDescription>Select an advertising account from the dropdown above to view your performance metrics, reports, and campaign data.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        );
    }

    return (
        <DashboardLayout
            accountDataCard={<AccountDataCard />}
            amsMetricsCard={<AmsMetricsCard />}
            eventStream={<EventStream />}
            metrics={<PerformanceMetrics className="pt-4" />}
            performanceTable={<PerformanceTable />}
            reportsTable={<ReportsTable />}
        />
    );
}

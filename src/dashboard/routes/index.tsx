import { HugeiconsIcon } from '@hugeicons/react';
import ChartBarLineIcon from '@merchbaseco/icons/core-stroke-rounded/ChartBarLineIcon';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty';
import { AccountDataCard } from './components/account-data-card';
import { AmsMetricsCard } from './components/ams-metrics-card';
import { PerformanceMetrics } from './components/performance-metrics';
import { ReportsTable } from './components/reports-table/reports-table';
import { EventStream } from './components/event-stream';
import { useSelectedAccountId } from './hooks/use-selected-accountid';

export function IndexRoute() {
    const accountId = useSelectedAccountId();

    // Show empty state when no account is selected
    if (!accountId) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-120px)] px-4">
                <Empty className="border border-border bg-card/50 max-w-lg">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <HugeiconsIcon icon={ChartBarLineIcon} size={20} />
                        </EmptyMedia>
                        <EmptyTitle>No account selected</EmptyTitle>
                        <EmptyDescription>
                            Select an advertising account from the dropdown above to view your performance metrics, reports, and campaign data.
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        );
    }

    return (
        <div>
            <PerformanceMetrics className="pt-4" />

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 max-w-background-frame-max mx-auto px-4 mt-4">
                <div className="md:col-span-2">
                    <AccountDataCard />
                </div>
                <div className="md:col-span-4">
                    <AmsMetricsCard />
                </div>
            </div>

            <div className="max-w-background-frame-max mx-auto px-4 mt-4">
                <EventStream />
            </div>

            <ReportsTable className="max-w-background-frame-max mx-auto px-4 mt-6" />
        </div>
    );
}

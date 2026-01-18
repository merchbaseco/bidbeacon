import { HugeiconsIcon } from '@hugeicons/react';
import ChartBarLineIcon from '@merchbaseco/icons/core-stroke-rounded/ChartBarLineIcon';
import { useAtomValue } from 'jotai';
import { ConnectionStatusBadge } from '../components/connection-status-badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty';
import { connectionStatusAtom } from './atoms';
import { AccountDataCard } from './components/account-data-card';
import { AccountEnabledSwitch } from './components/account-selector/account-enabled-switch';
import { AmsMetricsCard } from './components/ams-metrics-card';
import { DailyPerformanceMetrics } from './components/daily-performance-metrics';
import { ReportsTable } from './components/reports-table/reports-table';
import { EventStream } from './components/event-stream';
import { useSelectedAccountId } from './hooks/use-selected-accountid';

export function IndexRoute() {
    const connectionStatus = useAtomValue(connectionStatusAtom);
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
            <div className="flex items-center justify-between gap-2 py-1 max-w-background-frame-max mx-auto px-4 pt-3">
                <AccountEnabledSwitch />
                <ConnectionStatusBadge status={connectionStatus} className="mt-0.5" />
            </div>

            <DailyPerformanceMetrics className="mt-4" />

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

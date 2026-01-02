import { useAtomValue } from 'jotai';
import { ConnectionStatusBadge } from '../components/connection-status-badge';
import { connectionStatusAtom } from './atoms';
import { AccountDataCard } from './components/account-data-card';
import { AccountEnabledSwitch } from './components/account-selector/account-enabled-switch';
import { AmsMetricsCard } from './components/ams-metrics-card';
import { DailyPerformanceMetrics } from './components/daily-performance-metrics';
import { ReportsTable } from './components/reports-table/reports-table';
import { JobSessionsFeed } from './components/job-sessions-feed';

export function IndexRoute() {
    const connectionStatus = useAtomValue(connectionStatusAtom);

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
                <JobSessionsFeed />
            </div>

            <ReportsTable className="max-w-background-frame-max mx-auto px-4 mt-6" />
        </div>
    );
}

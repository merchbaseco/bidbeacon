import { HugeiconsIcon } from '@hugeicons/react';
import ArrowExpandIcon from '@merchbaseco/icons/core-solid-rounded/ArrowExpandIcon';
import { useAtomValue } from 'jotai';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { ConnectionStatusBadge } from '../components/connection-status-badge';
import { Card } from '../components/ui/card';
import { connectionStatusAtom } from './atoms';
import { AccountDataCard } from './components/account-data-card';
import { AccountEnabledSwitch } from './components/account-selector/account-enabled-switch';
import { ApiMetricsChart } from './components/ads-api-stats/api-metrics-chart';
import { ApiMetricsTable } from './components/ads-api-stats/api-metrics-table';
import { ThrottlerMetricsChart } from './components/ads-api-stats/throttler-metrics-chart';
import { ChartCard } from './components/chart-card';
import { DatasetHealthTracker } from './components/health-tracker';
import { JobMetricsChart } from './components/job-metrics-chart';
import { ReportsTable } from './components/reports-table/index';

export function IndexRoute() {
    const connectionStatus = useAtomValue(connectionStatusAtom);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 py-1">
                <AccountEnabledSwitch />
                <ConnectionStatusBadge status={connectionStatus} className="mt-0.5" />
            </div>
            <div className="space-y-10">
                <div className="grid grid-cols-6 gap-4">
                    <div className="col-span-2">
                        <AccountDataCard />
                    </div>
                    <div className="col-span-2">
                        <Card></Card>
                    </div>
                    <div className="col-span-2">
                        <Card></Card>
                    </div>
                </div>
                <div className="col-span-6 grid grid-cols-2 gap-3">
                    <ChartCard title="Amazon Ads API Invocations" legendItems={[]}>
                        <ApiMetricsChart />
                    </ChartCard>
                    <ChartCard
                        title="API Throttler Metrics"
                        legendItems={[
                            { label: 'Total Calls', value: '', color: LEGEND_COLORS[3] }, // Blue
                            { label: 'Rate Limited (429)', value: '', color: LEGEND_COLORS[5] }, // Red
                        ]}
                    >
                        <ThrottlerMetricsChart />
                    </ChartCard>
                    <div className="col-span-2">
                        <ApiMetricsTable />
                    </div>
                </div>
                <div className="col-span-6 grid grid-cols-2 gap-3">
                    <Card className="p-3 space-y-0 gap-3 col-span-2">
                        <div className="flex items-start justify-between px-2 pb-1">
                            <div className="text-sm font-medium">Job Invocations</div>
                        </div>
                        <JobMetricsChart />
                    </Card>
                </div>
                <Card className="p-3 space-y-0 gap-3">
                    <div className="flex items-start justify-between px-2">
                        <div className="text-sm font-medium">Daily Dataset Health</div>
                        <HugeiconsIcon icon={ArrowExpandIcon} size={20} color="currentColor" />
                    </div>
                    <DatasetHealthTracker aggregation="daily" />
                </Card>
                <Card className="p-3 space-y-0 gap-3">
                    <div className="flex items-start justify-between px-2">
                        <div className="text-sm font-medium">Hourly Dataset Health</div>
                        <HugeiconsIcon icon={ArrowExpandIcon} size={20} color="currentColor" />
                    </div>
                    <DatasetHealthTracker aggregation="hourly" />
                </Card>
            </div>
            <ReportsTable />
        </div>
    );
}

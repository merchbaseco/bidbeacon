import { HugeiconsIcon } from '@hugeicons/react';
import ArrowExpandIcon from '@merchbaseco/icons/core-solid-rounded/ArrowExpandIcon';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { ConnectionStatusBadge } from '../components/connection-status-badge';
import { Card } from '../components/ui/card';
import { Frame } from '../components/ui/frame';
import { connectionStatusAtom } from './atoms';
import { AccountDataCard } from './components/account-data-card';
import { AccountEnabledSwitch } from './components/account-selector/account-enabled-switch';
import { ApiMetricsTable } from './components/ads-api-stats/api-metrics-table';
import { ChartCard } from './components/chart-card';
import { DatasetHealthTracker } from './components/health-tracker';
import { JobMetricsChart } from './components/job-metrics-chart';
import { JobMetricsTable } from './components/job-metrics-table';
import { ReportsTable } from './components/reports-table/reports-table';

export function IndexRoute() {
    const connectionStatus = useAtomValue(connectionStatusAtom);

    const legendItems = useMemo(() => {
        return [
            { label: 'API', value: '', color: 'rainbow' },
            { label: '429', value: '', color: LEGEND_COLORS[5] }, // Red
        ];
    }, []);

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

                <div className="grid grid-cols-2 gap-1">
                    <Frame className="w-full overflow-visible">
                        <div className="grid grid-cols-1 gap-1">
                            <ChartCard title="Ads API Invocations" legendItems={legendItems}>
                                {/* <ThrottlerMetricsChart /> */}
                            </ChartCard>
                            <div>
                                <ApiMetricsTable />
                            </div>
                        </div>
                    </Frame>

                    <Frame className="w-full overflow-visible">
                        <div className="grid grid-cols-1 gap-1">
                            <ChartCard title="Job Invocations" legendItems={[]}>
                                <JobMetricsChart />
                            </ChartCard>
                            <JobMetricsTable />
                        </div>
                    </Frame>
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

                <ReportsTable />
            </div>
        </div>
    );
}

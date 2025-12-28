import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { LEGEND_COLORS } from '@/dashboard/lib/chart-constants';
import { ConnectionStatusBadge } from '../components/connection-status-badge';
import { Frame } from '../components/ui/frame';
import { connectionStatusAtom } from './atoms';
import { AccountDataCard } from './components/account-data-card';
import { AccountEnabledSwitch } from './components/account-selector/account-enabled-switch';
import { AmsMetricsCard } from './components/ams-metrics-card';
import { ApiMetricsChart } from './components/ads-api-stats/api-metrics-chart';
import { ApiMetricsTable } from './components/ads-api-stats/api-metrics-table';
import { ChartCard } from './components/chart-card';
import { DailyPerformanceMetrics } from './components/daily-performance-metrics';
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-background-frame-max mx-auto px-4 mt-4">
                <Frame>
                    <ChartCard title="Ads API Invocations" legendItems={legendItems}>
                        <ApiMetricsChart />
                    </ChartCard>
                    <ApiMetricsTable className="pt-1.5" />
                </Frame>
                <Frame>
                    <ChartCard title="Job Invocations" legendItems={[]}>
                        <JobMetricsChart />
                    </ChartCard>
                    <JobMetricsTable className="pt-1.5" />
                </Frame>
            </div>

            <ReportsTable className="max-w-background-frame-max mx-auto px-4 mt-6" />
        </div>
    );
}

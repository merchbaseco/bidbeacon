import { HugeiconsIcon } from '@hugeicons/react';
import ArrowExpandIcon from '@merchbaseco/icons/core-solid-rounded/ArrowExpandIcon';
import { useAtomValue } from 'jotai';
import { ConnectionStatusBadge } from '../components/connection-status-badge';
import { Card } from '../components/ui/card';
import { connectionStatusAtom } from './atoms';
import { AccountEnabledSwitch } from './components/account-selector/account-enabled-switch';
import { DatasetHealthTracker } from './components/health-tracker';
import { ReportsTable } from './components/reports-table';

export function IndexRoute() {
    const connectionStatus = useAtomValue(connectionStatusAtom);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 py-1">
                <AccountEnabledSwitch />
                <ConnectionStatusBadge status={connectionStatus} className="mt-0.5" />
            </div>
            <div className="space-y-4">
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

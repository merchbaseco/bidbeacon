import { DatasetHealthTrackerView } from './components/dataset-health-tracker-view';
import { ReportsTable } from './components/reports-table';

export function IndexRoute() {
    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div>
                    <h2 className="text-sm font-medium mb-2">Daily Dataset Health</h2>
                    <DatasetHealthTrackerView aggregation="daily" />
                </div>
                <div>
                    <h2 className="text-sm font-medium mb-2">Hourly Dataset Health</h2>
                    <DatasetHealthTrackerView aggregation="hourly" />
                </div>
            </div>
            <ReportsTable />
        </div>
    );
}

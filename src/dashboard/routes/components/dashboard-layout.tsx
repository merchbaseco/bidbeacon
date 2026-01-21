import type { ReactNode } from 'react';

type DashboardLayoutProps = {
    metrics: ReactNode;
    performanceTable: ReactNode;
    accountDataCard: ReactNode;
    amsMetricsCard: ReactNode;
    eventStream: ReactNode;
    reportsTable: ReactNode;
};

const DashboardLayout = ({
    metrics,
    performanceTable,
    accountDataCard,
    amsMetricsCard,
    eventStream,
    reportsTable,
}: DashboardLayoutProps) => {
    return (
        <div>
            {metrics}

            <div className="max-w-background-frame-max mx-auto px-4 mt-4">
                {performanceTable}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 max-w-background-frame-max mx-auto px-4 mt-4">
                <div className="md:col-span-2">{accountDataCard}</div>
                <div className="md:col-span-4">{amsMetricsCard}</div>
            </div>

            <div className="max-w-background-frame-max mx-auto px-4 mt-4">
                {eventStream}
            </div>

            <div className="max-w-background-frame-max mx-auto px-4 mt-6">
                {reportsTable}
            </div>
        </div>
    );
};

export { DashboardLayout };

import type { ReactNode } from 'react';

type DashboardLayoutProps = {
    metrics: ReactNode;
    performanceTable: ReactNode;
    accountDataCard: ReactNode;
    amsMetricsCard: ReactNode;
    eventStream: ReactNode;
    reportsTable: ReactNode;
};

const DashboardLayout = ({ metrics, performanceTable, accountDataCard, amsMetricsCard, eventStream, reportsTable }: DashboardLayoutProps) => {
    return (
        <div>
            {metrics}

            <div className="mx-auto mt-4 max-w-background-frame-max px-4">{performanceTable}</div>

            <div className="mx-auto mt-4 grid max-w-background-frame-max grid-cols-1 gap-4 px-4 md:grid-cols-6">
                <div className="md:col-span-2">{accountDataCard}</div>
                <div className="md:col-span-4">{amsMetricsCard}</div>
            </div>

            <div className="mx-auto mt-4 max-w-background-frame-max px-4">{eventStream}</div>

            <div className="mx-auto mt-6 max-w-background-frame-max px-4">{reportsTable}</div>
        </div>
    );
};

export { DashboardLayout };

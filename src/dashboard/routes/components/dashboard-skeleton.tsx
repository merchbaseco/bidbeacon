import { Card } from '../../components/ui/card';
import { Frame } from '../../components/ui/frame';
import { Skeleton } from '../../components/ui/skeleton';
import { DashboardLayout } from './dashboard-layout';

const DashboardSkeleton = () => {
    const metricLabels = ['w-20', 'w-24', 'w-28', 'w-18', 'w-16'].map((width, index) => ({
        id: `metric-label-${index}`,
        width,
    }));
    const accountRows = ['w-28', 'w-32', 'w-36', 'w-24'].map((width, index) => ({
        id: `account-row-${index}`,
        width,
    }));
    const amsRows = ['w-28', 'w-32', 'w-24', 'w-36'].map((width, index) => ({
        id: `ams-row-${index}`,
        width,
    }));
    const eventColumns = ['w-16', 'w-28', 'w-10', 'w-40'].map((width, index) => ({
        id: `event-column-${index}`,
        width,
    }));
    const histogramBars = Array.from({ length: 24 }, (_, index) => ({
        id: `histogram-bar-${index}`,
        heightClass: index % 6 === 0 ? 'h-14' : index % 4 === 0 ? 'h-10' : index % 3 === 0 ? 'h-6' : 'h-3',
    }));
    const eventRows = Array.from({ length: 8 }, (_, index) => `event-row-${index}`);
    const performanceHeaderCells = Array.from({ length: 7 }, (_, index) => `performance-header-${index}`);
    const performanceRows = Array.from({ length: 8 }, (_, index) => `performance-row-${index}`);
    const reportsHeaderCells = Array.from({ length: 7 }, (_, index) => `reports-header-${index}`);
    const reportsRows = Array.from({ length: 10 }, (_, index) => `reports-row-${index}`);

    return (
        <DashboardLayout
            accountDataCard={
                <Card className="gap-0 space-y-0 p-3 pb-1">
                    <div className="flex items-start justify-between pb-1 pl-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-6 w-10" />
                    </div>
                    <div className="divide-y px-1">
                        {accountRows.map(row => (
                            <div className="flex h-9 items-center justify-between" key={row.id}>
                                <Skeleton className={`h-4 ${row.width}`} />
                                <Skeleton className="h-4 w-12" />
                            </div>
                        ))}
                    </div>
                </Card>
            }
            amsMetricsCard={
                <Card className="gap-0 space-y-0 p-3 pb-1">
                    <div className="flex items-start justify-between pb-3 pl-1">
                        <Skeleton className="h-4 w-40" />
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 px-1 md:grid-cols-2">
                        <div className="divide-y">
                            {amsRows.map(row => (
                                <div className="flex h-9 items-center justify-between" key={row.id}>
                                    <Skeleton className={`h-4 ${row.width}`} />
                                    <Skeleton className="h-4 w-16" />
                                </div>
                            ))}
                        </div>
                        <div className="divide-y">
                            {amsRows.map(row => (
                                <div className="flex h-9 items-center justify-between" key={`${row.id}-secondary`}>
                                    <Skeleton className={`h-4 ${row.width}`} />
                                    <Skeleton className="h-4 w-16" />
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            }
            eventStream={
                <Card className="gap-0 overflow-hidden pt-4 pb-0 font-mono">
                    <div className="flex flex-wrap items-start justify-between gap-2 px-4">
                        <div className="-mt-1 flex flex-col gap-1">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-6 w-36" />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pb-3">
                                <Skeleton className="h-3 w-28" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Skeleton className="h-9 w-9 rounded-lg" />
                            <Skeleton className="h-9 w-9 rounded-lg" />
                        </div>
                    </div>
                    <div className="mt-4 mb-4 flex h-16 items-end gap-px px-4">
                        {histogramBars.map(bar => (
                            <div className="flex min-w-[2px] flex-1 items-end" key={bar.id}>
                                <Skeleton className={`w-full ${bar.heightClass}`} />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-[140px_210px_56px_1fr] gap-4 border-border border-b px-4 py-2 text-muted-foreground text-xs">
                        {eventColumns.map(column => (
                            <Skeleton className={`h-3 ${column.width}`} key={column.id} />
                        ))}
                    </div>
                    <div className="h-[420px] divide-y divide-border/60">
                        {eventRows.map(rowId => (
                            <div className="grid h-10 grid-cols-[140px_210px_56px_1fr] items-center gap-4 px-4 py-2" key={rowId}>
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-3 w-32" />
                                <Skeleton className="h-3 w-10" />
                                <Skeleton className="h-3 w-40" />
                            </div>
                        ))}
                    </div>
                </Card>
            }
            metrics={
                <div className="pt-4">
                    <div className="mx-auto max-w-background-frame-max px-4">
                        <div className="mb-6 flex flex-col gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Skeleton className="h-8 w-28 rounded-full" />
                                    <Skeleton className="h-8 w-40 rounded-full" />
                                    <Skeleton className="h-8 w-24 rounded-full" />
                                </div>
                                <Skeleton className="h-6 w-24 rounded-full" />
                            </div>
                            <div className="mt-4 flex flex-wrap items-start gap-8 md:gap-12">
                                {metricLabels.map(label => (
                                    <div className="flex flex-col gap-2" key={label.id}>
                                        <Skeleton className={`h-3 ${label.width}`} />
                                        <Skeleton className="h-6 w-20" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <Skeleton className="h-[360px] w-full rounded-none" />
                    <div className="mx-auto mt-6 max-w-background-frame-max px-4">
                        <Skeleton className="h-12 w-full rounded-lg" />
                    </div>
                </div>
            }
            performanceTable={
                <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Skeleton className="h-7 w-52" />
                        <Skeleton className="h-7 w-32" />
                        <Skeleton className="h-7 w-36" />
                        <Skeleton className="h-7 w-32" />
                        <Skeleton className="h-7 w-40" />
                    </div>
                    <Frame className="w-full">
                        <div className="rounded-xl border border-border bg-background bg-clip-padding shadow-xs">
                            <div className="grid grid-cols-7 gap-2 border-border border-b px-3 py-2 text-muted-foreground text-xs">
                                {performanceHeaderCells.map(cellId => (
                                    <Skeleton className="h-3 w-16" key={cellId} />
                                ))}
                            </div>
                            <div className="h-[520px] space-y-3 px-3 py-3">
                                {performanceRows.map(rowId => (
                                    <div className="flex items-center justify-between gap-3" key={rowId}>
                                        <Skeleton className="h-4 w-48" />
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-16" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="px-3 py-2 text-muted-foreground text-xs">
                            <Skeleton className="h-3 w-40" />
                        </div>
                    </Frame>
                </div>
            }
            reportsTable={
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Skeleton className="h-7 w-32" />
                        <Skeleton className="h-7 w-32" />
                        <Skeleton className="h-7 w-28" />
                        <Skeleton className="h-7 w-9 rounded-lg" />
                    </div>
                    <Frame className="w-full">
                        <div className="rounded-xl border border-border bg-background bg-clip-padding shadow-xs">
                            <div className="grid grid-cols-[280px_150px_150px_100px_100px_200px_1fr] gap-2 border-border border-b px-3 py-2 text-muted-foreground text-xs">
                                {reportsHeaderCells.map(cellId => (
                                    <Skeleton className="h-3 w-20" key={cellId} />
                                ))}
                            </div>
                            <div className="min-h-[560px] space-y-3 px-3 py-3">
                                {reportsRows.map(rowId => (
                                    <div className="grid grid-cols-[280px_150px_150px_100px_100px_200px_1fr] items-center gap-2" key={rowId}>
                                        <Skeleton className="h-4 w-40" />
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-4 w-20 justify-self-end" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-2">
                            <div className="flex items-center justify-between gap-2">
                                <Skeleton className="h-3 w-36" />
                                <Skeleton className="h-8 w-24" />
                            </div>
                        </div>
                    </Frame>
                </div>
            }
        />
    );
};

export { DashboardSkeleton };

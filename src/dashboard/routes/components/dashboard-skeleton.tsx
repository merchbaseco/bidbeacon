import { Card } from '../../components/ui/card';
import { Frame } from '../../components/ui/frame';
import { Skeleton } from '../../components/ui/skeleton';
import { DashboardLayout } from './dashboard-layout';

const DashboardSkeleton = () => {
    const metricLabels = ['w-20', 'w-24', 'w-28', 'w-18', 'w-16'];
    const accountRows = ['w-28', 'w-32', 'w-36', 'w-24'];
    const amsRows = ['w-28', 'w-32', 'w-24', 'w-36'];
    const eventColumns = ['w-16', 'w-28', 'w-10', 'w-40'];
    const histogramBars = Array.from({ length: 24 });

    return (
        <DashboardLayout
            metrics={
                <div className="pt-4">
                    <div className="max-w-background-frame-max mx-auto px-4">
                        <div className="flex flex-col gap-4 mb-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Skeleton className="h-8 w-28 rounded-full" />
                                    <Skeleton className="h-8 w-40 rounded-full" />
                                    <Skeleton className="h-8 w-24 rounded-full" />
                                </div>
                                <Skeleton className="h-6 w-24 rounded-full" />
                            </div>
                            <div className="mt-4 flex flex-wrap items-start gap-8 md:gap-12">
                                {metricLabels.map((width, index) => (
                                    <div key={`${width}-${index}`} className="flex flex-col gap-2">
                                        <Skeleton className={`h-3 ${width}`} />
                                        <Skeleton className="h-6 w-20" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <Skeleton className="h-[360px] w-full rounded-none" />
                    <div className="max-w-background-frame-max mx-auto px-4 mt-6">
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
                            <div className="grid grid-cols-7 gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground">
                                {Array.from({ length: 7 }).map((_, index) => (
                                    <Skeleton key={index} className="h-3 w-16" />
                                ))}
                            </div>
                            <div className="h-[520px] px-3 py-3 space-y-3">
                                {Array.from({ length: 8 }).map((_, index) => (
                                    <div key={index} className="flex items-center justify-between gap-3">
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
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                            <Skeleton className="h-3 w-40" />
                        </div>
                    </Frame>
                </div>
            }
            accountDataCard={
                <Card className="p-3 pb-1 space-y-0 gap-0">
                    <div className="flex items-start justify-between pl-1 pb-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-6 w-10" />
                    </div>
                    <div className="divide-y px-1">
                        {accountRows.map((width, index) => (
                            <div key={`${width}-${index}`} className="flex items-center justify-between h-9">
                                <Skeleton className={`h-4 ${width}`} />
                                <Skeleton className="h-4 w-12" />
                            </div>
                        ))}
                    </div>
                </Card>
            }
            amsMetricsCard={
                <Card className="p-3 pb-1 space-y-0 gap-0">
                    <div className="flex items-start justify-between pl-1 pb-3">
                        <Skeleton className="h-4 w-40" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 px-1">
                        <div className="divide-y">
                            {amsRows.map((width, index) => (
                                <div key={`${width}-${index}`} className="flex items-center justify-between h-9">
                                    <Skeleton className={`h-4 ${width}`} />
                                    <Skeleton className="h-4 w-16" />
                                </div>
                            ))}
                        </div>
                        <div className="divide-y">
                            {amsRows.map((width, index) => (
                                <div key={`${width}-${index}`} className="flex items-center justify-between h-9">
                                    <Skeleton className={`h-4 ${width}`} />
                                    <Skeleton className="h-4 w-16" />
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            }
            eventStream={
                <Card className="font-mono pb-0 pt-4 gap-0 overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-2 px-4">
                        <div className="flex flex-col gap-1 -mt-1">
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
                    <div className="h-16 flex items-end gap-px mb-4 px-4 mt-4">
                        {histogramBars.map((_, index) => (
                            <div key={index} className="flex-1 min-w-[2px] flex items-end">
                                <Skeleton
                                    className={`w-full ${
                                        index % 6 === 0 ? 'h-14' : index % 4 === 0 ? 'h-10' : index % 3 === 0 ? 'h-6' : 'h-3'
                                    }`}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-[140px_210px_56px_1fr] gap-4 px-4 py-2 text-xs text-muted-foreground border-b border-border">
                        {eventColumns.map((width, index) => (
                            <Skeleton key={`${width}-${index}`} className={`h-3 ${width}`} />
                        ))}
                    </div>
                    <div className="h-[420px] divide-y divide-border/60">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div key={index} className="grid grid-cols-[140px_210px_56px_1fr] gap-4 px-4 py-2 h-10 items-center">
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-3 w-32" />
                                <Skeleton className="h-3 w-10" />
                                <Skeleton className="h-3 w-40" />
                            </div>
                        ))}
                    </div>
                </Card>
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
                            <div className="grid grid-cols-[280px_150px_150px_100px_100px_200px_1fr] gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground">
                                {Array.from({ length: 7 }).map((_, index) => (
                                    <Skeleton key={index} className="h-3 w-20" />
                                ))}
                            </div>
                            <div className="px-3 py-3 space-y-3 min-h-[560px]">
                                {Array.from({ length: 10 }).map((_, index) => (
                                    <div key={index} className="grid grid-cols-[280px_150px_150px_100px_100px_200px_1fr] gap-2 items-center">
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

import { api } from '@/dashboard/lib/trpc';
import { Card } from '../../../components/ui/card';
import { Spinner } from '../../../components/ui/spinner';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const ErrorStatusCard = () => {
    const { data, isLoading, error } = api.worker.metrics.useQuery(undefined, {
        refetchInterval: 60000, // 1 minute
        staleTime: 30000,
    });

    if (isLoading) {
        return (
            <Card className="p-4">
                <div className="flex items-center justify-center h-32">
                    <Spinner />
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-4">
                <div className="flex items-center justify-center h-32 text-destructive text-sm">
                    Error loading metrics: {error instanceof Error ? error.message : 'Unknown error'}
                </div>
            </Card>
        );
    }

    const dlqCount = data?.dlq?.approximateVisible ?? 0;
    const isHealthy = dlqCount === 0;

    return (
        <Card className="p-4">
            <div className="space-y-3">
                <div className="text-sm text-muted-foreground">Errors</div>
                <div className="flex flex-col items-start gap-2">
                    {isHealthy ? (
                        <>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="size-5 text-emerald-500" />
                                <span className="text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">0</span>
                            </div>
                            <div className="text-xs text-muted-foreground">in DLQ</div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <AlertCircle className="size-5 text-red-500" />
                                <span className="text-3xl font-semibold tracking-tight text-red-500 dark:text-red-400">{dlqCount.toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">in DLQ</div>
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
};


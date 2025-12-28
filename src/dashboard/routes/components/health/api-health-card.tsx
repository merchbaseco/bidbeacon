import { api } from '@/dashboard/lib/trpc';
import { Card } from '../../../components/ui/card';
import { Spinner } from '../../../components/ui/spinner';
import { cn } from '@/dashboard/lib/utils';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export const ApiHealthCard = () => {
    const { data, isLoading, error } = api.metrics.apiHealth.useQuery(undefined, {
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

    const successRate = data?.successRate ?? 100;
    const rateLimitCount = data?.rateLimitCount ?? 0;
    const total = data?.total ?? 0;

    // Determine health status
    const isHealthy = successRate >= 99 && rateLimitCount === 0;
    const isWarning = successRate >= 95 && (successRate < 99 || rateLimitCount > 0);
    const isError = successRate < 95;

    const statusIcon = isHealthy ? CheckCircle2 : isWarning ? AlertCircle : XCircle;
    const statusColor = isHealthy ? 'text-emerald-500' : isWarning ? 'text-amber-500' : 'text-red-500';
    const rateColor = isHealthy ? 'text-emerald-600 dark:text-emerald-400' : isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400';

    const StatusIcon = statusIcon;

    return (
        <Card className="p-4">
            <div className="space-y-3">
                <div className="text-sm text-muted-foreground">API Health</div>
                <div className="flex flex-col items-start gap-2">
                    <div className="flex items-center gap-2">
                        <StatusIcon className={cn('size-5', statusColor)} />
                        <span className={cn('text-3xl font-semibold tracking-tight', rateColor)}>{successRate.toFixed(1)}%</span>
                    </div>
                    <div className="space-y-1">
                        {rateLimitCount > 0 ? (
                            <div className="text-xs text-red-500 dark:text-red-400">{rateLimitCount} rate limit{rateLimitCount === 1 ? '' : 's'} (429)</div>
                        ) : (
                            <div className="text-xs text-muted-foreground">no 429s</div>
                        )}
                        {total > 0 && (
                            <div className="text-xs text-muted-foreground">{total.toLocaleString()} calls (60m)</div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
};


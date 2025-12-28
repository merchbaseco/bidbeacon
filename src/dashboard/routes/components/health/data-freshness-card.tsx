import { useMemo } from 'react';
import { api } from '@/dashboard/lib/trpc';
import { Card } from '../../../components/ui/card';
import { Spinner } from '../../../components/ui/spinner';

type StreamType = {
    label: string;
    entityType: 'spTraffic' | 'spConversion' | 'campaign' | 'adGroup' | 'ad' | 'target';
};

const STREAM_TYPES: StreamType[] = [
    { label: 'Traffic', entityType: 'spTraffic' },
    { label: 'Conversions', entityType: 'spConversion' },
    { label: 'Campaigns', entityType: 'campaign' },
    { label: 'Ad Groups', entityType: 'adGroup' },
    { label: 'Ads', entityType: 'ad' },
    { label: 'Targets', entityType: 'target' },
];

const formatTimeAgo = (timestamp: string): string => {
    const now = new Date().getTime();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / (60 * 1000));

    if (diffMins < 1) {
        return 'just now';
    }
    if (diffMins === 1) {
        return '1m ago';
    }
    if (diffMins < 60) {
        return `${diffMins}m ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) {
        return '1h ago';
    }
    return `${diffHours}h ago`;
};

const getStatusColor = (minutesAgo: number): string => {
    if (minutesAgo < 5) {
        return 'bg-emerald-500';
    }
    if (minutesAgo < 15) {
        return 'bg-amber-500';
    }
    return 'bg-red-500';
};

const StreamRow = ({ label, lastActivity }: { label: string; lastActivity?: string }) => {
    const minutesAgo = useMemo(() => {
        if (!lastActivity) return Infinity;
        const now = new Date().getTime();
        const then = new Date(lastActivity).getTime();
        return Math.floor((now - then) / (60 * 1000));
    }, [lastActivity]);

    const statusColor = getStatusColor(minutesAgo);
    const timeAgo = lastActivity ? formatTimeAgo(lastActivity) : 'never';

    return (
        <div className="flex items-center justify-between h-7">
            <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${statusColor}`} />
                <span className="text-sm">{label}</span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">{timeAgo}</span>
        </div>
    );
};

export const DataFreshnessCard = () => {
    const { data, isLoading, error } = api.metrics.amsRecent.useQuery(undefined, {
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

    const lastActivity = data?.lastActivity ?? {};

    return (
        <Card className="p-4">
            <div className="space-y-3">
                <div className="text-sm text-muted-foreground">Data Freshness</div>
                <div className="space-y-1">
                    {STREAM_TYPES.map(stream => (
                        <StreamRow key={stream.entityType} label={stream.label} lastActivity={lastActivity[stream.entityType]} />
                    ))}
                </div>
            </div>
        </Card>
    );
};


import { useStats } from '../hooks/use-stats.js';
import { formatDate } from '../utils.js';
import { StatCard } from './stat-card.js';

type ReportDatasetMetadata = {
    status: string;
    lastRefreshed: string | null;
};

interface StatsCardsProps {
    rows: ReportDatasetMetadata[];
    range: { from: string; to: string };
}

export function StatsCards({ rows, range }: StatsCardsProps) {
    const stats = useStats(rows);
    return (
        <div>
            <StatCard title="Latest refresh" value={stats.lastRefreshed ? formatDate(stats.lastRefreshed) : '—'} subtitle={`Window ${formatDate(range.from)} → ${formatDate(range.to)}`} />
            <StatCard title="Completed" value={stats.completed} subtitle={`${stats.total} rows total`} />
            <StatCard title="Failed" value={stats.failed} subtitle="Failed datasets" />
            <StatCard title="Fetching / Missing" value={`${stats.fetching} / ${stats.missing}`} subtitle="In-progress or waiting" />
        </div>
    );
}

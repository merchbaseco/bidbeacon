import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { ChartTooltipPortal } from './chart-tooltip-portal';

interface ChartTooltipProps {
    active?: boolean;
    payload?: {
        dataKey: string | number;
        name?: string;
        value?: number;
        color?: string;
    }[];
    label?: string;
    coordinate?: { x: number; y: number };
    chartData: Record<string, string | number>[];
    intervalMs: number;
}

export const ChartTooltip = ({ active, payload, label, coordinate, chartData, intervalMs }: ChartTooltipProps) => {
    if (!(active && payload) || payload.length === 0) {
        return null;
    }

    const point = chartData.find(p => p.interval === label);
    if (!point?.timestamp) {
        return null;
    }

    const timestamp = new Date(point.timestamp as string);
    // Check if timestamp is valid
    if (Number.isNaN(timestamp.getTime())) {
        return null;
    }

    const endTime = new Date(timestamp.getTime() + intervalMs);

    // Format time with or without seconds based on interval
    const timeFormat = intervalMs < 60_000 ? 'h:mm:ssaaa' : 'h:mmaaa';
    const localStart = format(timestamp, timeFormat);
    const localEnd = format(endTime, timeFormat);

    // Format UTC time range
    const utcStart = formatInTimeZone(timestamp, 'UTC', timeFormat);
    const utcEnd = formatInTimeZone(endTime, 'UTC', timeFormat);

    // Check if this is a throttler metrics point with rate limit data
    const total = point.total;
    const rateLimited = point.rateLimited;
    const hasRateLimitData = typeof total === 'number' && typeof rateLimited === 'number';
    const rateLimitPercentage = hasRateLimitData && total > 0 ? ((rateLimited / total) * 100).toFixed(1) : null;

    return (
        <ChartTooltipPortal active={active} coordinate={coordinate}>
            <div className="min-w-[180px] rounded-lg border border-border bg-card p-3 shadow-lg">
                {/* Series list */}
                <div className="mb-3 flex flex-col gap-1.5">
                    {payload.map(entry => (
                        <div className="flex items-center justify-between gap-3" key={entry.dataKey}>
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-foreground text-sm">{entry.name}</span>
                            </div>
                            <span className="font-medium text-foreground text-sm">{entry.value}</span>
                        </div>
                    ))}
                    {rateLimitPercentage !== null && (
                        <div className="flex items-center justify-between gap-3 border-border border-t pt-1">
                            <span className="text-muted-foreground text-sm">Rate Limit %</span>
                            <span className="font-medium text-foreground text-sm">{rateLimitPercentage}%</span>
                        </div>
                    )}
                </div>

                {/* Time ranges */}
                <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-muted-foreground">
                        {localStart} - {localEnd}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                        {utcStart} - {utcEnd} UTC
                    </span>
                </div>
            </div>
        </ChartTooltipPortal>
    );
};

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
    if (!active || !payload || payload.length === 0) return null;

    const point = chartData.find(p => p.interval === label);
    if (!point || !point.timestamp) return null;

    const timestamp = new Date(point.timestamp as string);
    // Check if timestamp is valid
    if (Number.isNaN(timestamp.getTime())) return null;

    const endTime = new Date(timestamp.getTime() + intervalMs);

    // Format time with or without seconds based on interval
    const timeFormat = intervalMs < 60000 ? 'h:mm:ssaaa' : 'h:mmaaa';
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
            <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                {/* Series list */}
                <div className="flex flex-col gap-1.5 mb-3">
                    {payload.map(entry => (
                        <div key={entry.dataKey} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                <span className="text-sm text-foreground">{entry.name}</span>
                            </div>
                            <span className="text-sm text-foreground font-medium">{entry.value}</span>
                        </div>
                    ))}
                    {rateLimitPercentage !== null && (
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                            <span className="text-sm text-muted-foreground">Rate Limit %</span>
                            <span className="text-sm text-foreground font-medium">{rateLimitPercentage}%</span>
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

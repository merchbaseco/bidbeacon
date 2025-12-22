'use client';

import { useMemo } from 'react';
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import { useReports, type ReportSummary } from '../hooks/use-reports';
import { formatDate } from '../utils';

export type HealthColor = 'completed' | 'failed' | 'fetching' | 'missing';
export type Aggregation = 'daily' | 'hourly';

const SLOT_COUNT = 60;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function statusToColor(status: string): HealthColor {
    switch (status) {
        case 'completed':
            return 'completed';
        case 'failed':
            return 'failed';
        case 'fetching':
            return 'fetching';
        case 'missing':
            return 'missing';
        default:
            return 'missing';
    }
}

function normalizeToSlotStart(date: Date, aggregation: Aggregation): Date {
    if (aggregation === 'daily') {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()));
}

function slotTimes(aggregation: Aggregation, count: number, now: Date): Date[] {
    const msPerSlot = aggregation === 'daily' ? MS_PER_DAY : MS_PER_HOUR;
    const times: Date[] = [];

    for (let i = 0; i < count; i++) {
        const t = new Date(now.getTime() - i * msPerSlot);
        times.push(normalizeToSlotStart(t, aggregation));
    }

    return times;
}

function cornerClass(index: number, length: number): string {
    if (index === 0) return 'rounded-l-lg';
    if (index === length - 1) return 'rounded-r-lg';
    return 'rounded-none';
}

const COLOR_CLASS: Record<HealthColor, string> = {
    completed: 'bg-success',
    failed: 'bg-destructive',
    fetching: 'bg-info',
    missing: 'bg-muted',
};

export function HealthTracker({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('flex gap-0.5 h-10 rounded-lg overflow-hidden', className)}>{children}</div>;
}

function SlotPopup({ slot, summary }: { slot: Date; summary?: ReportSummary }) {
    if (!summary) {
        return (
            <div className="space-y-2">
                <div>
                    <div className="text-xs font-medium text-muted-foreground">Period Start</div>
                    <div className="text-sm font-medium">{formatDate(slot.toISOString())}</div>
                </div>
                <div>
                    <div className="text-xs font-medium text-muted-foreground">Status</div>
                    <div className="text-sm">Missing</div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div>
                <div className="text-xs font-medium text-muted-foreground">Period Start</div>
                <div className="text-sm font-medium">{formatDate(summary.periodStart)}</div>
            </div>
            <div>
                <div className="text-xs font-medium text-muted-foreground">Status</div>
                <div className="text-sm capitalize">{summary.status}</div>
            </div>
        </div>
    );
}

function TrackerSlot({ slot, summary, index, length }: { slot: Date; summary?: ReportSummary; index: number; length: number }) {
    const color: HealthColor = summary ? statusToColor(summary.status) : 'missing';
    const rounding = cornerClass(index, length);

    return (
        <Tooltip>
            <TooltipTrigger
                className={cn(
                    'flex-1 h-full transition-colors cursor-pointer p-0 m-0 border-0 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
                    COLOR_CLASS[color],
                    rounding
                )}
                delay={100}
            />
            <TooltipPopup>
                <SlotPopup slot={slot} summary={summary} />
            </TooltipPopup>
        </Tooltip>
    );
}

export function DatasetHealthTracker({
    aggregation,
    className,
    slotCount = SLOT_COUNT,
    entityType = 'target',
}: {
    aggregation: Aggregation;
    className?: string;
    slotCount?: number;
    entityType?: 'target' | 'product';
}) {
    const { data: summaries = [], isLoading } = useReports();

    const model = useMemo(() => {
        const now = new Date();
        const slots = slotTimes(aggregation, slotCount, now);

        // Filter summaries by aggregation and entity type to match the table filter
        const filteredSummaries = summaries.filter(d => d.aggregation === aggregation && d.entityType === entityType);

        // Create a map keyed by normalized slot time
        const map = new Map<string, ReportSummary>();
        for (const s of filteredSummaries) {
            const key = normalizeToSlotStart(new Date(s.periodStart), aggregation).toISOString();
            map.set(key, s);
        }

        return slots.map(slot => ({ slot, summary: map.get(slot.toISOString()) }));
    }, [aggregation, summaries, slotCount, entityType]);

    if (isLoading) {
        const now = new Date();
        const slots = slotTimes(aggregation, slotCount, now);

        return (
            <HealthTracker className={className}>
                {slots.map((slot, index) => (
                    <div key={`skeleton-${aggregation}-${slot.toISOString()}`} className={cn('flex-1 h-full bg-muted animate-pulse', cornerClass(index, slots.length))} />
                ))}
            </HealthTracker>
        );
    }

    return (
        <HealthTracker className={className}>
            <TooltipProvider>
                {model.map(({ slot, summary }, index) => (
                    <TrackerSlot
                        key={`${aggregation}-${slot.toISOString()}-${summary?.uid ?? 'missing'}`}
                        slot={slot}
                        summary={summary}
                        index={index}
                        length={model.length}
                    />
                ))}
            </TooltipProvider>
        </HealthTracker>
    );
}

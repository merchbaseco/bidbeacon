'use client';

import { useMemo } from 'react';
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import type { ReportDatasetMetadata } from '../hooks/use-report-datasets';
import { useReportDatasets } from '../hooks/use-report-datasets';
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

function SlotPopup({ slot, dataset }: { slot: Date; dataset?: ReportDatasetMetadata }) {
    if (!dataset) {
        return (
            <div className="space-y-2">
                <div>
                    <div className="text-xs font-medium text-muted-foreground">Timestamp</div>
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
                <div className="text-xs font-medium text-muted-foreground">Timestamp</div>
                <div className="text-sm font-medium">{formatDate(dataset.periodStart)}</div>
            </div>
            <div>
                <div className="text-xs font-medium text-muted-foreground">Status</div>
                <div className="text-sm capitalize">{dataset.status}</div>
            </div>
            {dataset.nextRefreshAt && (
                <div>
                    <div className="text-xs font-medium text-muted-foreground">Next Refresh</div>
                    <div className="text-sm">{formatDate(dataset.nextRefreshAt)}</div>
                </div>
            )}
            <div>
                <div className="text-xs font-medium text-muted-foreground">Report ID</div>
                <div className="text-xs font-mono">{dataset.reportId}</div>
            </div>
            {dataset.error && (
                <div>
                    <div className="text-xs font-medium text-muted-foreground">Error</div>
                    <div className="text-sm text-destructive">{dataset.error}</div>
                </div>
            )}
        </div>
    );
}

function TrackerSlot({ slot, dataset, index, length }: { slot: Date; dataset?: ReportDatasetMetadata; index: number; length: number }) {
    const color: HealthColor = dataset ? statusToColor(dataset.status) : 'missing';
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
                <SlotPopup slot={slot} dataset={dataset} />
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
    const { data: datasets = [], isLoading } = useReportDatasets(aggregation);

    const model = useMemo(() => {
        const now = new Date();
        const slots = slotTimes(aggregation, slotCount, now);

        // Filter datasets by entity type to match the table filter
        const filteredDatasets = datasets.filter(d => d.entityType === entityType);

        const map = new Map<string, ReportDatasetMetadata>();
        for (const d of filteredDatasets) {
            const key = normalizeToSlotStart(new Date(d.periodStart), aggregation).toISOString();
            map.set(key, d);
        }

        return slots.map(slot => ({ slot, dataset: map.get(slot.toISOString()) }));
    }, [aggregation, datasets, slotCount, entityType]);

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
                {model.map(({ slot, dataset }, index) => (
                    <TrackerSlot
                        // If there can be multiple datasets per slot, this will still be stable.
                        key={`${aggregation}-${slot.toISOString()}-${dataset?.reportId ?? 'missing'}`}
                        slot={slot}
                        dataset={dataset}
                        index={index}
                        length={model.length}
                    />
                ))}
            </TooltipProvider>
        </HealthTracker>
    );
}

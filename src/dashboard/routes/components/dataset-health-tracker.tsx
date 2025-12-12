'use client';

import type { ReactNode } from 'react';
import {
    PreviewCard,
    PreviewCardPopup,
    PreviewCardTrigger,
} from '../../components/ui/preview-card';
import { cn } from '../../lib/utils';
import type { ReportDatasetMetadata } from '../hooks/use-report-datasets';
import { formatDate } from '../utils';

interface HealthTrackerItemProps {
    color: 'completed' | 'failed' | 'fetching' | 'missing';
    dataset?: ReportDatasetMetadata;
    className?: string;
}

function HealthTrackerItem({ color, className }: HealthTrackerItemProps) {
    const colorClasses = {
        completed: 'bg-green-600 dark:bg-green-500',
        failed: 'bg-red-600 dark:bg-red-500',
        fetching: 'bg-green-300 dark:bg-green-400',
        missing: 'bg-gray-400 dark:bg-gray-500',
    };

    return (
        <div
            className={cn(
                'h-full flex-1 rounded-sm transition-colors',
                colorClasses[color],
                className
            )}
            title={`Dataset status: ${color}`}
        />
    );
}

interface HealthTrackerProps {
    children: ReactNode;
    className?: string;
}

function HealthTracker({ children, className }: HealthTrackerProps) {
    return (
        <div
            className={cn('flex gap-0.5 h-8 rounded-md overflow-hidden', className)}
            title="Dataset health tracker"
        >
            {children}
        </div>
    );
}

interface HealthTrackerItemWithPreviewProps {
    dataset: ReportDatasetMetadata;
    color: 'completed' | 'failed' | 'fetching' | 'missing';
}

function HealthTrackerItemWithPreview({ dataset, color }: HealthTrackerItemWithPreviewProps) {
    return (
        <PreviewCard openDelay={100} closeDelay={50}>
            <PreviewCardTrigger asChild>
                <div className="flex-1 cursor-pointer">
                    <HealthTrackerItem color={color} />
                </div>
            </PreviewCardTrigger>
            <PreviewCardPopup>
                <div className="space-y-2">
                    <div>
                        <div className="text-xs font-medium text-muted-foreground">Timestamp</div>
                        <div className="text-sm font-medium">{formatDate(dataset.timestamp)}</div>
                    </div>
                    <div>
                        <div className="text-xs font-medium text-muted-foreground">Status</div>
                        <div className="text-sm capitalize">{dataset.status}</div>
                    </div>
                    {dataset.lastRefreshed && (
                        <div>
                            <div className="text-xs font-medium text-muted-foreground">
                                Last Refreshed
                            </div>
                            <div className="text-sm">{formatDate(dataset.lastRefreshed)}</div>
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
            </PreviewCardPopup>
        </PreviewCard>
    );
}

export { HealthTracker, HealthTrackerItem, HealthTrackerItemWithPreview };
export type { HealthTrackerProps, HealthTrackerItemProps };

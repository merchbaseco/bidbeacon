'use client';

import { useMemo } from 'react';
import { useReportDatasets } from '../hooks/use-report-datasets';
import { HealthTracker, HealthTrackerItemWithPreview } from './dataset-health-tracker';

interface DatasetHealthTrackerViewProps {
    aggregation: 'daily' | 'hourly';
    className?: string;
}

function getStatusColor(status: string): 'completed' | 'failed' | 'fetching' | 'missing' {
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

export function DatasetHealthTrackerView({
    aggregation,
    className,
}: DatasetHealthTrackerViewProps) {
    const { data: datasets = [], isLoading } = useReportDatasets(aggregation);

    // Get the most recent 60 datasets, reverse so most recent is on the left
    const displayDatasets = useMemo(() => {
        const sorted = [...datasets].sort((a, b) => {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        return sorted.slice(0, 60).reverse(); // Most recent first, then reverse for left-to-right display
    }, [datasets]);

    // Fill missing slots with placeholder items (if we have less than 60)
    const items = useMemo(() => {
        const items: Array<{
            dataset?: (typeof datasets)[0];
            color: 'completed' | 'failed' | 'fetching' | 'missing';
        }> = [];

        // Add actual datasets
        displayDatasets.forEach(dataset => {
            items.push({
                dataset,
                color: getStatusColor(dataset.status),
            });
        });

        // Fill remaining slots with missing placeholders
        while (items.length < 60) {
            items.push({
                color: 'missing',
            });
        }

        return items;
    }, [displayDatasets]);

    if (isLoading) {
        return (
            <div className={className}>
                <div className="flex gap-0.5 h-8 rounded-md overflow-hidden">
                    {Array.from({ length: 60 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-sm animate-pulse"
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <HealthTracker>
                {items.map((item, index) => {
                    if (item.dataset) {
                        return (
                            <HealthTrackerItemWithPreview
                                key={`${item.dataset.timestamp}-${item.dataset.aggregation}-${item.dataset.reportId}`}
                                dataset={item.dataset}
                                color={item.color}
                            />
                        );
                    }
                    return (
                        <div key={`missing-${aggregation}-${index}`} className="flex-1">
                            <div className="h-full bg-gray-400 dark:bg-gray-500 rounded-sm" />
                        </div>
                    );
                })}
            </HealthTracker>
        </div>
    );
}

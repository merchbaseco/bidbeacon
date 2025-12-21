import { useEffect, useRef } from 'react';
import { api } from '../../lib/trpc';
import { useWebSocketEvents } from './use-websocket-events';

export const useAdsApiThrottlerMetrics = (params?: { from?: string; to?: string }) => {
    const { data, isLoading, ...rest } = api.metrics.adsApiThrottler.useQuery(
        {
            from: params?.from,
            to: params?.to,
        },
        {
            refetchInterval: 10000, // Refetch every 10 seconds as fallback/sync
            refetchOnWindowFocus: true, // Also refetch when window regains focus
            staleTime: 5000,
            placeholderData: previousData => previousData, // Preserve previous data while loading
        }
    );

    // Listen for WebSocket events and append new data
    const queryClient = api.useUtils();
    const dataRef = useRef(data);

    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    useWebSocketEvents('api-metrics:updated', event => {
        if (!dataRef.current) return;

        const eventTimestamp = new Date(event.data.timestamp);
        const fromTime = params?.from ? new Date(params.from) : new Date(Date.now() - 60 * 1000);
        const toTime = params?.to ? new Date(params.to) : new Date();

        // Only process if event is within our time range
        if (eventTimestamp < fromTime || eventTimestamp > toTime) return;

        // Calculate which 1-second interval this belongs to
        const intervalStart = new Date(eventTimestamp);
        intervalStart.setMilliseconds(0);
        const intervalKey = intervalStart.toISOString();

        // Create a new data object to avoid mutating the ref directly
        const newData = { ...dataRef.current };
        const existingIntervalIndex = newData.data.findIndex(p => p.interval === intervalKey);

        if (existingIntervalIndex >= 0) {
            // Increment counts in existing interval
            newData.data[existingIntervalIndex] = {
                ...newData.data[existingIntervalIndex],
                total: newData.data[existingIntervalIndex].total + 1,
                rateLimited: newData.data[existingIntervalIndex].rateLimited + (event.data.statusCode === 429 ? 1 : 0),
            };
        } else {
            // Add new interval
            newData.data = [
                ...newData.data,
                {
                    interval: intervalKey,
                    total: 1,
                    rateLimited: event.data.statusCode === 429 ? 1 : 0,
                },
            ];
            // Sort by interval to maintain order
            newData.data.sort((a, b) => new Date(a.interval).getTime() - new Date(b.interval).getTime());
        }

        // Update the ref
        dataRef.current = newData;

        // Update the query cache
        queryClient.metrics.adsApiThrottler.setData(
            {
                from: params?.from,
                to: params?.to,
            },
            newData
        );
    });

    return {
        data,
        isLoading,
        ...rest,
    };
};

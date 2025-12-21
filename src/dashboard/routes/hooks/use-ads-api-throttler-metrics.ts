import { useEffect, useRef } from 'react';
import { api } from '../../lib/trpc';
import { useWebSocketEvents } from './use-websocket-events';

export const useAdsApiThrottlerMetrics = (params: { from: string; to: string }) => {
    const { data, isLoading, ...rest } = api.metrics.adsApiThrottler.useQuery(params, {
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
        staleTime: 5000,
        placeholderData: previousData => previousData,
    });

    const queryClient = api.useUtils();
    const dataRef = useRef(data);

    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    useWebSocketEvents('api-metrics:updated', event => {
        if (!dataRef.current) return;

        const eventTimestamp = new Date(event.data.timestamp);
        const fromTime = new Date(params.from);
        const toTime = new Date(params.to);

        if (eventTimestamp < fromTime || eventTimestamp > toTime) return;

        const intervalStart = new Date(eventTimestamp);
        intervalStart.setMilliseconds(0);
        const intervalKey = intervalStart.toISOString();

        const newData = { ...dataRef.current };
        const existingIntervalIndex = newData.data.findIndex(p => p.interval === intervalKey);

        if (existingIntervalIndex >= 0) {
            newData.data[existingIntervalIndex] = {
                ...newData.data[existingIntervalIndex],
                total: newData.data[existingIntervalIndex].total + 1,
                rateLimited: newData.data[existingIntervalIndex].rateLimited + (event.data.statusCode === 429 ? 1 : 0),
            };
        } else {
            newData.data = [
                ...newData.data,
                {
                    interval: intervalKey,
                    total: 1,
                    rateLimited: event.data.statusCode === 429 ? 1 : 0,
                },
            ];
            newData.data.sort((a, b) => new Date(a.interval).getTime() - new Date(b.interval).getTime());
        }

        dataRef.current = newData;
        queryClient.metrics.adsApiThrottler.setData(params, newData);
    });

    return {
        data,
        isLoading,
        ...rest,
    };
};

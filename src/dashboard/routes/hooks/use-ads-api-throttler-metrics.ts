import { useEffect, useRef } from 'react';
import { api } from '../../lib/trpc';
import { useWebSocketEvents } from './use-websocket-events';

type ChartPoint = { time: string; timestamp: string; total: number; rateLimited: number };
type ThrottlerData = { data: ChartPoint[] };

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

    // Handle real-time updates via WebSocket
    useWebSocketEvents('api-metrics:updated', event => {
        if (!dataRef.current) return;

        const eventTime = new Date(event.data.timestamp);
        eventTime.setMilliseconds(0);
        const eventTimestamp = eventTime.toISOString();

        // Find the matching second in our data
        const pointIndex = dataRef.current.data.findIndex(p => p.timestamp === eventTimestamp);
        if (pointIndex === -1) return;

        // Create updated data
        const newData: ThrottlerData = {
            data: dataRef.current.data.map((point, i) => {
                if (i !== pointIndex) return point;
                return {
                    ...point,
                    total: point.total + 1,
                    rateLimited: point.rateLimited + (event.data.statusCode === 429 ? 1 : 0),
                };
            }),
        };

        dataRef.current = newData;
        queryClient.metrics.adsApiThrottler.setData(params, newData);
    });

    return { data, isLoading, ...rest };
};

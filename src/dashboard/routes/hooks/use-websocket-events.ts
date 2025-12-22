import { useRef } from 'react';
import useWebSocketLib from 'react-use-websocket';
import { apiBaseUrl } from '../../router';

type Event =
    | {
          type: 'api-metrics:updated';
          apiName: string;
          timestamp: string;
          data: { apiName: string; region: string; statusCode: number | null; success: boolean; durationMs: number; timestamp: string; error: string | null };
      }
    | { type: 'job-metrics:updated'; jobName: string; timestamp: string }
    | {
          type: 'report-dataset-metadata:updated';
          data: {
              accountId: string;
              countryCode: string;
              periodStart: string;
              aggregation: 'hourly' | 'daily';
              entityType: 'target' | 'product';
              status: string;
              refreshing: boolean;
              nextRefreshAt: string | null;
              lastReportCreatedAt: string | null;
              reportId: string | null;
              error: string | null;
          };
          timestamp: string;
      }
    | { type: 'account-dataset-metadata:updated'; accountId: string; countryCode: string; timestamp: string }
    | { type: 'reports:refreshed'; accountId: string; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string }
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'pong' };

/**
 * Hook to listen for specific WebSocket events
 * Uses the shared WebSocket connection from react-use-websocket
 * @param eventType - The type of event to listen for
 * @param handler - Callback function that receives the event data
 */
export function useWebSocketEvents<T extends Event['type']>(eventType: T, handler: (event: Extract<Event, { type: T }>) => void): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    // Compute WebSocket URL lazily inside the hook to avoid initialization order issues
    const wsUrl = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

    useWebSocketLib(wsUrl, {
        onMessage: event => {
            try {
                const data: Event = JSON.parse(event.data);
                if (data.type === eventType) {
                    handlerRef.current(data as Extract<Event, { type: T }>);
                }
            } catch {
                // Ignore malformed messages
            }
        },
        shouldReconnect: () => true,
        reconnectAttempts: 5,
        reconnectInterval: attemptNumber => Math.min(1000 * 2 ** attemptNumber, 30000),
        share: true, // Share connection with other hooks
    });
}

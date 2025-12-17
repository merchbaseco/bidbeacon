import { useState } from 'react';
import useWebSocketLib from 'react-use-websocket';
import { apiBaseUrl } from '../../router';

type ReportRefreshEvent =
    | {
          type: 'report-refresh:started';
          accountId: string;
          countryCode: string;
          rowTimestamp: string;
          aggregation: 'hourly' | 'daily';
          entityType: 'target' | 'product';
      }
    | {
          type: 'report-refresh:completed';
          accountId: string;
          countryCode: string;
          rowTimestamp: string;
          aggregation: 'hourly' | 'daily';
          entityType: 'target' | 'product';
      }
    | {
          type: 'report-refresh:failed';
          accountId: string;
          countryCode: string;
          rowTimestamp: string;
          aggregation: 'hourly' | 'daily';
          entityType: 'target' | 'product';
      };

const WS_URL = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

/**
 * Hook to track loading state for report refreshes based on WebSocket events
 */
export function useReportRefreshLoading() {
    const [loadingRefreshes, setLoadingRefreshes] = useState<Set<string>>(new Set());

    const handleMessage = (event: MessageEvent) => {
        try {
            const data: ReportRefreshEvent = JSON.parse(event.data);

            if (data.type === 'report-refresh:started' || data.type === 'report-refresh:completed' || data.type === 'report-refresh:failed') {
                const rowKey = `${data.rowTimestamp}-${data.aggregation}-${data.entityType}`;

                if (data.type === 'report-refresh:started') {
                    setLoadingRefreshes(prev => new Set(prev).add(rowKey));
                } else {
                    // completed or failed - remove from loading set
                    setLoadingRefreshes(prev => {
                        const next = new Set(prev);
                        next.delete(rowKey);
                        return next;
                    });
                }
            }
        } catch {
            // Ignore malformed messages
        }
    };

    useWebSocketLib(WS_URL, {
        onMessage: handleMessage,
        shouldReconnect: () => true,
        reconnectAttempts: 5,
        reconnectInterval: attemptNumber => Math.min(1000 * 2 ** attemptNumber, 30000),
        heartbeat: {
            message: JSON.stringify({ type: 'ping' }),
            returnMessage: JSON.stringify({ type: 'pong' }),
            timeout: 60000,
            interval: 30000,
        },
        share: true,
    });

    return loadingRefreshes;
}

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

/**
 * Hook to track loading state for report refreshes based on WebSocket events
 */
export function useReportRefreshLoading() {
    const [loadingRefreshes, setLoadingRefreshes] = useState<Set<string>>(new Set());

    // Compute WS_URL inside the hook to avoid initialization order issues
    const wsUrl = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

    const handleMessage = (event: MessageEvent) => {
        try {
            const data: ReportRefreshEvent = JSON.parse(event.data);

            if (data.type === 'report-refresh:started' || data.type === 'report-refresh:completed' || data.type === 'report-refresh:failed') {
                const rowKey = `${data.rowTimestamp}-${data.aggregation}-${data.entityType}`;
                console.log(`[useReportRefreshLoading] Received ${data.type} event`, {
                    rowTimestamp: data.rowTimestamp,
                    aggregation: data.aggregation,
                    entityType: data.entityType,
                    rowKey,
                });

                if (data.type === 'report-refresh:started') {
                    setLoadingRefreshes(prev => new Set(prev).add(rowKey));
                    console.log(`[useReportRefreshLoading] Added ${rowKey} to loading set`);
                } else {
                    // completed or failed - remove from loading set
                    setLoadingRefreshes(prev => {
                        const next = new Set(prev);
                        next.delete(rowKey);
                        return next;
                    });
                    console.log(`[useReportRefreshLoading] Removed ${rowKey} from loading set`);
                }
            }
        } catch (error) {
            console.error('[useReportRefreshLoading] Error parsing message:', error);
            // Ignore malformed messages
        }
    };

    useWebSocketLib(wsUrl, {
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

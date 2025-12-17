import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import useWebSocketLib, { ReadyState } from 'react-use-websocket';
import { toast } from 'sonner';
import { api } from '../../lib/trpc.js';
import { apiBaseUrl } from '../../router';
import { type ConnectionStatus, connectionStatusAtom } from '../atoms';

type Event =
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string }
    | { type: 'reports:refreshed'; accountId: string; timestamp: string }
    | { type: 'api-metrics:updated'; apiName: string; timestamp: string }
    | { type: 'account-dataset-metadata:updated'; accountId: string; countryCode: string; timestamp: string }
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
          data: {
              accountId: string;
              countryCode: string;
              timestamp: string;
              aggregation: 'hourly' | 'daily';
              entityType: 'target' | 'product';
              status: string;
              lastRefreshed: string | null;
              lastReportCreatedAt: string | null;
              reportId: string | null;
              error: string | null;
          };
      }
    | {
          type: 'report-refresh:failed';
          accountId: string;
          countryCode: string;
          rowTimestamp: string;
          aggregation: 'hourly' | 'daily';
          entityType: 'target' | 'product';
          error: string;
      }
    | { type: 'pong' };

const WS_URL = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

export function useWebSocket(): ConnectionStatus {
    const utils = api.useUtils();
    const setConnectionStatus = useSetAtom(connectionStatusAtom);

    const handleMessage = useCallback(
        (event: MessageEvent) => {
            try {
                const data: Event = JSON.parse(event.data);

                switch (data.type) {
                    case 'error':
                        toast.error('Error', {
                            description: data.message,
                        });
                        break;
                    case 'account:updated':
                        toast.info('Account updated', {
                            description: `Account ${data.accountId} updated`,
                        });
                        utils.accounts.list.invalidate();
                        break;
                    case 'reports:refreshed':
                        // Invalidate dashboard status queries to refresh the table
                        utils.reports.status.invalidate();
                        toast.success('Reports refreshed', {
                            description: 'Report dataset metadata has been updated',
                            duration: 5000, // Auto-dismiss after 5 seconds
                        });
                        break;
                    case 'api-metrics:updated':
                        // Invalidate API metrics queries to refresh the chart
                        utils.metrics.api.invalidate();
                        break;
                    case 'account-dataset-metadata:updated':
                        // Invalidate account dataset metadata query to refresh the sync status
                        utils.accounts.datasetMetadata.invalidate({
                            accountId: data.accountId,
                            countryCode: data.countryCode,
                        });
                        // Show success toast only when sync completes (status changes from syncing to completed)
                        // Note: We can't determine this from the event alone, so we'll check in the component
                        break;
                    case 'report-refresh:started':
                        // Loading state will be handled by component
                        // No action needed here
                        break;
                    case 'report-refresh:completed': {
                        // Invalidate all queries matching this account/country/aggregation
                        // Components will refetch and get the updated data
                        utils.reports.status.invalidate({
                            accountId: data.accountId,
                            countryCode: data.countryCode,
                            aggregation: data.aggregation,
                        });
                        break;
                    }
                    case 'report-refresh:failed':
                        toast.error('Report refresh failed', {
                            description: data.error,
                        });
                        break;
                }
            } catch {
                // Ignore malformed messages
            }
        },
        [utils]
    );

    const { readyState } = useWebSocketLib(WS_URL, {
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

    const status: ConnectionStatus = readyState === ReadyState.OPEN ? 'connected' : readyState === ReadyState.CONNECTING ? 'connecting' : 'disconnected';

    useEffect(() => {
        setConnectionStatus(status);
    }, [status, setConnectionStatus]);

    return status;
}

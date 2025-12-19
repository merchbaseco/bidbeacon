import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import useWebSocketLib, { ReadyState } from 'react-use-websocket';
import { toast } from 'sonner';
import { api } from '../../lib/trpc';
import { apiBaseUrl } from '../../router';
import { type ConnectionStatus, connectionStatusAtom } from '../atoms';

type Event =
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string }
    | { type: 'reports:refreshed'; accountId: string; timestamp: string }
    | { type: 'api-metrics:updated'; apiName: string; timestamp: string }
    | { type: 'job-metrics:updated'; jobName: string; timestamp: string }
    | { type: 'account-dataset-metadata:updated'; accountId: string; countryCode: string; timestamp: string }
    | {
          type: 'report-dataset-metadata:updated';
          data: {
              accountId: string;
              countryCode: string;
              timestamp: string;
              aggregation: 'hourly' | 'daily';
              entityType: 'target' | 'product';
              status: string;
              refreshing: boolean;
              lastRefreshed: string | null;
              lastReportCreatedAt: string | null;
              reportId: string | null;
              error: string | null;
          };
          timestamp: string;
      }
    | { type: 'pong' };

const WS_URL = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

export const useWebSocket = () => {
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
                    case 'job-metrics:updated':
                        // Invalidate job metrics queries to refresh the chart
                        utils.metrics.job.invalidate();
                        break;
                    case 'account-dataset-metadata:updated':
                        // Invalidate account dataset metadata query to refresh the sync status
                        utils.accounts.datasetMetadata.invalidate({
                            accountId: data.accountId,
                            countryCode: data.countryCode,
                        });
                        break;
                    case 'report-dataset-metadata:updated':
                        // Invalidate queries to refresh the report status with updated data
                        utils.reports.status.invalidate({
                            accountId: data.data.accountId,
                            countryCode: data.data.countryCode,
                            aggregation: data.data.aggregation,
                        });
                        // Show error toast if there's an error
                        if (data.data.error) {
                            toast.error('Report refresh failed', {
                                description: data.data.error,
                            });
                        }
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

    return { status };
};

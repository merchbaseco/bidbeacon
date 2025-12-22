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
    | {
          type: 'api-metrics:updated';
          apiName: string;
          timestamp: string;
          data: {
              apiName: string;
              region: string;
              statusCode: number | null;
              success: boolean;
              durationMs: number;
              timestamp: string;
              error: string | null;
          };
      }
    | { type: 'job-metrics:updated'; jobName: string; timestamp: string }
    | { type: 'account-dataset-metadata:updated'; accountId: string; countryCode: string; timestamp: string }
    | {
          type: 'report:refreshed';
          row: {
              uid: string;
              accountId: string;
              countryCode: string;
              periodStart: string;
              aggregation: string;
              entityType: string;
              status: string;
              refreshing: boolean;
              nextRefreshAt: string | null;
              lastReportCreatedAt: string | null;
              reportId: string | null;
              lastProcessedReportId: string | null;
              error: string | null;
          };
          timestamp: string;
      }
    | {
          type: 'report-dataset-metadata:error';
          data: {
              accountId: string;
              countryCode: string;
              periodStart: string;
              aggregation: 'hourly' | 'daily';
              entityType: 'target' | 'product';
              error: string;
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
                        break;
                    case 'api-metrics:updated':
                        // Invalidate API metrics queries to refresh the table
                        // Note: adsApi uses 5-minute intervals and refreshes automatically
                        utils.metrics.adsApi.invalidate();
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

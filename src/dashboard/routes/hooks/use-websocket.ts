import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import useWebSocketLib, { ReadyState } from 'react-use-websocket';
import { toast } from 'sonner';
import { BIDBEACON_REALTIME_PROTOCOL } from '@/realtime-protocol';
import { api } from '../../lib/trpc';
import { apiBaseUrl } from '../../router';
import { type ConnectionStatus, connectionStatusAtom } from '../atoms';
import { useRealtimeTicket } from './use-realtime-ticket';

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
              attemptCount: number;
              retryCount: number;
              rateLimitCount: number;
              amazonRetryAfterMs: number | null;
              governorCooldownMs: number | null;
              rateLimitRequestId: string | null;
              rateLimitResponseContentType: string | null;
              rateLimitResponseServer: string | null;
              queueWaitMs: number;
              timestamp: string;
              error: string | null;
          };
      }
    | { type: 'job-metrics:updated'; jobName: string; timestamp: string }
    | {
          type: 'events:updated';
          accountId: string | null;
          timestamp: string;
      }
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

const WS_BASE_URL = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

export const useWebSocket = () => {
    const utils = api.useUtils();
    const setConnectionStatus = useSetAtom(connectionStatusAtom);
    const { refresh, ticket } = useRealtimeTicket();

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
                        // Invalidate dashboard summary queries to refresh the table
                        utils.reports.summary.invalidate();
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
                    case 'events:updated':
                        utils.metrics.events.invalidate();
                        break;
                    case 'account-dataset-metadata:updated':
                        // Invalidate account dataset metadata query to refresh the sync status
                        utils.accounts.datasetMetadata.invalidate({
                            accountId: data.accountId,
                            countryCode: data.countryCode,
                        });
                        break;
                    case 'report:refreshed':
                        // Update the individual report cache directly with the row data from the event
                        // This avoids re-fetching and allows selective row updates in the UI
                        utils.reports.get.setData({ uid: data.row.uid }, prev => (prev ? { ...prev, ...data.row } : undefined));
                        break;
                    default:
                        break;
                }
            } catch {
                // Ignore malformed messages
            }
        },
        [utils]
    );

    const { readyState } = useWebSocketLib(ticket ? WS_BASE_URL : null, {
        onMessage: handleMessage,
        onClose: () => {
            refresh().catch(() => undefined);
        },
        protocols: ticket ? [BIDBEACON_REALTIME_PROTOCOL, ticket] : undefined,
        heartbeat: {
            message: JSON.stringify({ type: 'ping' }),
            returnMessage: JSON.stringify({ type: 'pong' }),
            timeout: 60_000,
            interval: 30_000,
        },
        shouldReconnect: () => false,
        share: true,
    });

    const status: ConnectionStatus = readyState === ReadyState.OPEN ? 'connected' : readyState === ReadyState.CONNECTING ? 'connecting' : 'disconnected';

    useEffect(() => {
        setConnectionStatus(status);
    }, [status, setConnectionStatus]);

    return { status };
};

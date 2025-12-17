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
                        // Update individual row using setQueryData
                        const queryCache = utils.reports.status.getQueryCache();
                        const matchingQueries = queryCache.findAll({
                            queryKey: ['reports', 'status'],
                            predicate: query => {
                                const [, params] = query.queryKey as [string, unknown];
                                const queryParams = params as {
                                    accountId?: string;
                                    countryCode?: string;
                                    aggregation?: string;
                                };
                                return queryParams?.accountId === data.accountId && queryParams?.countryCode === data.countryCode && queryParams?.aggregation === data.aggregation;
                            },
                        });

                        // Update each matching query
                        matchingQueries.forEach(query => {
                            utils.reports.status.setQueryData(query.queryKey[1] as unknown, (oldData: { success: boolean; data?: unknown[] } | undefined) => {
                                if (!oldData?.data || !Array.isArray(oldData.data)) return oldData;
                                return {
                                    ...oldData,
                                    data: oldData.data.map((row: unknown) => {
                                        const r = row as {
                                            timestamp: string;
                                            aggregation: string;
                                            entityType: string;
                                        };
                                        if (r.timestamp === data.rowTimestamp && r.aggregation === data.aggregation && r.entityType === data.entityType) {
                                            return data.data;
                                        }
                                        return row;
                                    }),
                                };
                            });
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

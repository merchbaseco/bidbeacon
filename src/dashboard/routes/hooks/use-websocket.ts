import { useQueryClient } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import useWebSocketLib, { ReadyState } from 'react-use-websocket';
import { toastManager } from '../../components/ui/toast';
import { apiBaseUrl } from '../../router';
import { type ConnectionStatus, connectionStatusAtom } from '../atoms';
import { queryKeys } from './query-keys';

type Event =
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string }
    | { type: 'reports:refreshed'; accountId: string; timestamp: string }
    | { type: 'api-metrics:updated'; apiName: string; timestamp: string }
    | { type: 'pong' };

const WS_URL = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

export function useWebSocket(): ConnectionStatus {
    const queryClient = useQueryClient();
    const setConnectionStatus = useSetAtom(connectionStatusAtom);

    const handleMessage = useCallback(
        (event: MessageEvent) => {
            try {
                const data: Event = JSON.parse(event.data);

                switch (data.type) {
                    case 'error':
                        toastManager.add({
                            type: 'error',
                            title: 'Error',
                            description: data.message,
                        });
                        break;
                    case 'account:updated':
                        toastManager.add({
                            type: 'info',
                            title: 'Account updated',
                            description: `Account ${data.accountId} updated`,
                        });
                        queryClient.invalidateQueries({
                            queryKey: queryKeys.advertisingAccounts(),
                        });
                        break;
                    case 'reports:refreshed':
                        // Invalidate dashboard status queries to refresh the table
                        queryClient.invalidateQueries({
                            queryKey: queryKeys.dashboardStatusAll(),
                        });
                        toastManager.add({
                            type: 'success',
                            title: 'Reports refreshed',
                            description: 'Report dataset metadata has been updated',
                            timeout: 5000, // Auto-dismiss after 5 seconds
                        });
                        break;
                    case 'api-metrics:updated':
                        // Invalidate API metrics queries to refresh the chart
                        queryClient.invalidateQueries({
                            queryKey: ['api-metrics'],
                        });
                        break;
                }
            } catch {
                // Ignore malformed messages
            }
        },
        [queryClient]
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

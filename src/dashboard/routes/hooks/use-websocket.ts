import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import useWebSocketLib, { ReadyState } from 'react-use-websocket';
import { toastManager } from '../../components/ui/toast';
import { apiBaseUrl } from '../../router';
import { queryKeys } from './query-keys';

type Event =
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string }
    | { type: 'accounts:synced'; timestamp: string }
    | { type: 'pong' };

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const WS_URL = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

export function useWebSocket(): ConnectionStatus {
    const queryClient = useQueryClient();

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
                    case 'accounts:synced':
                        toastManager.add({
                            type: 'info',
                            title: 'Accounts synced',
                            description: 'Advertising accounts table has been updated',
                        });
                        queryClient.invalidateQueries({
                            queryKey: queryKeys.advertisingAccounts(),
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

    return status;
}

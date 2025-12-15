import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import useWebSocketLib, { ReadyState } from 'react-use-websocket';
import { toastManager } from '../../components/ui/toast';
import { apiBaseUrl } from '../../router';
import { type ConnectionStatus, connectionStatusAtom, loadingToastsAtom, syncAccountsInProgressAtom } from '../atoms';
import { queryKeys } from './query-keys';

const SYNC_ACCOUNTS_TOAST_KEY = 'sync-accounts-toast';

type Event =
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string }
    | { type: 'accounts:synced'; timestamp: string }
    | { type: 'reports:refreshed'; accountId: string; timestamp: string }
    | { type: 'pong' };

const WS_URL = `${apiBaseUrl.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

export function useWebSocket(): ConnectionStatus {
    const queryClient = useQueryClient();
    const setConnectionStatus = useSetAtom(connectionStatusAtom);
    const setSyncAccountsInProgress = useSetAtom(syncAccountsInProgressAtom);
    const loadingToasts = useAtomValue(loadingToastsAtom);
    const setLoadingToasts = useSetAtom(loadingToastsAtom);

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
                        queryClient.invalidateQueries({
                            queryKey: ['api-metrics'],
                        });
                        break;
                    case 'accounts:synced': {
                        // Check if there's a loading toast for sync accounts and dismiss it
                        const syncToastId = loadingToasts[SYNC_ACCOUNTS_TOAST_KEY];
                        if (syncToastId) {
                            // Dismiss the loading toast
                            toastManager.close(syncToastId);
                            // Remove toast ID from atom
                            setLoadingToasts(prev => {
                                const next = { ...prev };
                                delete next[SYNC_ACCOUNTS_TOAST_KEY];
                                return next;
                            });
                            setSyncAccountsInProgress(false);
                        }
                        // Show a new success toast
                        toastManager.add({
                            type: 'success',
                            title: 'Accounts synced',
                            description: 'Advertising accounts table has been updated',
                            timeout: 5000, // Auto-dismiss after 5 seconds
                        });
                        queryClient.invalidateQueries({
                            queryKey: queryKeys.advertisingAccounts(),
                        });
                        queryClient.invalidateQueries({
                            queryKey: ['api-metrics'],
                        });
                        break;
                    }
                    case 'reports:refreshed':
                        // Invalidate dashboard status queries to refresh the table
                        queryClient.invalidateQueries({
                            queryKey: queryKeys.dashboardStatusAll(),
                        });
                        queryClient.invalidateQueries({
                            queryKey: ['api-metrics'],
                        });
                        toastManager.add({
                            type: 'success',
                            title: 'Reports refreshed',
                            description: 'Report dataset metadata has been updated',
                            timeout: 5000, // Auto-dismiss after 5 seconds
                        });
                        break;
                }
            } catch {
                // Ignore malformed messages
            }
        },
        [queryClient, setSyncAccountsInProgress, loadingToasts, setLoadingToasts]
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

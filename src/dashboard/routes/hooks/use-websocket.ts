import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { toastManager } from '../../components/ui/toast';
import { apiBaseUrl } from '../../router';
import { queryKeys } from './query-keys';

type EventType = 'error' | 'account:updated';

interface BaseEvent {
    type: EventType;
    timestamp: string;
}

interface ErrorEvent extends BaseEvent {
    type: 'error';
    message: string;
    details?: string;
}

interface AccountUpdatedEvent extends BaseEvent {
    type: 'account:updated';
    accountId: string;
    enabled: boolean;
}

type Event = ErrorEvent | AccountUpdatedEvent;

/**
 * Hook to manage WebSocket connection for real-time events
 */
export function useWebSocket() {
    const queryClient = useQueryClient();
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 1000; // 1 second

    const handleEvent = useCallback(
        (event: Event) => {
            switch (event.type) {
                case 'error':
                    toastManager.createToast({
                        type: 'error',
                        title: 'Error',
                        description: event.message,
                    });
                    break;

                case 'account:updated':
                    // Invalidate advertising accounts query to refetch updated data
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.advertisingAccounts(),
                    });
                    break;

                default:
                    console.warn('[WebSocket] Unknown event type:', event);
            }
        },
        [queryClient]
    );

    const connect = useCallback(() => {
        // Convert HTTP/HTTPS URL to WebSocket URL (ws/wss)
        const wsUrl = `${apiBaseUrl.replace(/^https?/, match => (match === 'https' ? 'wss' : 'ws'))}/api/events`;

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[WebSocket] Connected');
                reconnectAttemptsRef.current = 0;
            };

            ws.onmessage = event => {
                try {
                    const data: Event = JSON.parse(event.data);
                    handleEvent(data);
                } catch (error) {
                    console.error('[WebSocket] Error parsing message:', error);
                }
            };

            ws.onerror = error => {
                console.error('[WebSocket] Error:', error);
            };

            ws.onclose = () => {
                console.log('[WebSocket] Disconnected');
                wsRef.current = null;

                // Attempt to reconnect with exponential backoff
                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    const delay = baseReconnectDelay * 2 ** reconnectAttemptsRef.current;
                    reconnectAttemptsRef.current++;

                    reconnectTimeoutRef.current = window.setTimeout(() => {
                        console.log(
                            `[WebSocket] Reconnecting (attempt ${reconnectAttemptsRef.current})...`
                        );
                        connect();
                    }, delay);
                } else {
                    console.error('[WebSocket] Max reconnection attempts reached');
                }
            };
        } catch (error) {
            console.error('[WebSocket] Failed to connect:', error);
        }
    }, [handleEvent]);

    useEffect(() => {
        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (reconnectTimeoutRef.current !== null) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [connect]);
}

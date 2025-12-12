import type { QueryClient } from '@tanstack/react-query';
import { toastManager } from '../../components/ui/toast';
import { apiBaseUrl } from '../../router';
import { queryKeys } from './query-keys';

type Event =
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string };

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
type StatusCallback = (status: ConnectionStatus) => void;

const WS_URL = `${apiBaseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws'))}/api/events`;

class WebSocketManager {
    private ws: WebSocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private statusCallbacks = new Set<StatusCallback>();
    private queryClient: QueryClient | null = null;
    private reconnectAttempts = 0;
    private reconnectTimeout: number | null = null;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly BASE_DELAY_MS = 1000;

    setQueryClient(queryClient: QueryClient) {
        this.queryClient = queryClient;
    }

    subscribe(callback: StatusCallback): () => void {
        console.log('[WS Manager] subscribe() called', {
            currentSubscribers: this.statusCallbacks.size,
            currentStatus: this.status,
            wsState: this.ws?.readyState,
        });
        this.statusCallbacks.add(callback);
        callback(this.status);
        this.connect();
        return () => {
            console.log('[WS Manager] unsubscribe() called', {
                subscribersBefore: this.statusCallbacks.size,
            });
            this.statusCallbacks.delete(callback);
            console.log('[WS Manager] unsubscribe() complete', {
                subscribersAfter: this.statusCallbacks.size,
            });
            if (this.statusCallbacks.size === 0) {
                console.log('[WS Manager] No more subscribers, disconnecting');
                this.disconnect();
            }
        };
    }

    private notifyStatus(status: ConnectionStatus) {
        this.status = status;
        this.statusCallbacks.forEach(cb => cb(status));
    }

    private connect() {
        console.log('[WS Manager] connect() called', {
            wsState: this.ws?.readyState,
            subscribers: this.statusCallbacks.size,
            url: WS_URL,
        });

        if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('[WS Manager] Already OPEN, skipping');
            return;
        }
        if (this.ws?.readyState === WebSocket.CONNECTING) {
            console.log('[WS Manager] Already CONNECTING, skipping');
            return;
        }

        // Clean up any existing connection first
        if (this.ws) {
            console.log('[WS Manager] Cleaning up existing connection before creating new one');
            // Clear ping interval
            if ((this.ws as any).__pingInterval) {
                clearInterval((this.ws as any).__pingInterval);
            }
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onopen = null;
            this.ws.onmessage = null;
            try {
                this.ws.close();
            } catch {
                // Ignore errors closing
            }
            this.ws = null;
        }

        console.log('[WS Manager] Creating new WebSocket connection');
        this.notifyStatus('connecting');
        const ws = new WebSocket(WS_URL);
        this.ws = ws;

        ws.onopen = () => {
            console.log('[WS Manager] onopen fired', {
                subscribers: this.statusCallbacks.size,
            });
            this.reconnectAttempts = 0;
            this.notifyStatus('connected');

            // Send ping every 30 seconds to keep connection alive
            const pingInterval = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    try {
                        this.ws.send(JSON.stringify({ type: 'ping' }));
                    } catch (e) {
                        console.error('[WS Manager] Ping failed', e);
                        clearInterval(pingInterval);
                    }
                } else {
                    clearInterval(pingInterval);
                }
            }, 30000);

            // Store interval ID so we can clear it on close
            (ws as any).__pingInterval = pingInterval;
        };

        ws.onmessage = e => {
            try {
                const data: Event = JSON.parse(e.data);
                this.handleEvent(data);
            } catch {
                // Ignore malformed messages
            }
        };

        ws.onerror = e => {
            console.error('[WS Manager] onerror fired', e);
        };

        ws.onclose = e => {
            // Clear ping interval
            if ((ws as any).__pingInterval) {
                clearInterval((ws as any).__pingInterval);
            }

            console.log('[WS Manager] onclose fired', {
                code: e.code,
                reason: e.reason,
                wasClean: e.wasClean,
                subscribers: this.statusCallbacks.size,
                reconnectAttempts: this.reconnectAttempts,
            });

            // Only clear ws ref if this is the current connection
            if (this.ws === ws) {
                this.ws = null;
            }

            this.notifyStatus('disconnected');

            // Don't reconnect if no subscribers or max attempts reached
            if (this.statusCallbacks.size === 0) {
                console.log('[WS Manager] No subscribers, not reconnecting');
                return;
            }

            if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
                console.log('[WS Manager] Max reconnect attempts reached, giving up');
                return;
            }

            // For code 1006 (abnormal closure), wait longer before retrying
            const baseDelay = e.code === 1006 ? this.BASE_DELAY_MS * 5 : this.BASE_DELAY_MS;
            const delay = baseDelay * 2 ** this.reconnectAttempts++;

            console.log('[WS Manager] Scheduling reconnect', {
                delay,
                attempt: this.reconnectAttempts,
                code: e.code,
            });

            // Clear any existing timeout
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }

            this.reconnectTimeout = window.setTimeout(() => {
                // Double-check we still have subscribers before connecting
                if (this.statusCallbacks.size > 0) {
                    this.connect();
                }
            }, delay);
        };
    }

    private disconnect() {
        console.log('[WS Manager] disconnect() called', {
            hasTimeout: this.reconnectTimeout !== null,
            wsState: this.ws?.readyState,
        });
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            console.log('[WS Manager] Closing WebSocket');
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
        this.notifyStatus('disconnected');
    }

    private handleEvent(event: Event) {
        if (event.type === 'error') {
            toastManager.createToast({
                type: 'error',
                title: 'Error',
                description: event.message,
            });
        } else if (event.type === 'account:updated' && this.queryClient) {
            this.queryClient.invalidateQueries({
                queryKey: queryKeys.advertisingAccounts(),
            });
        }
    }
}

export const websocketManager = new WebSocketManager();

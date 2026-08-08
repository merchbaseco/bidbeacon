import type { InferSelectModel } from 'drizzle-orm';
import { useRef } from 'react';
import useWebSocketLib from 'react-use-websocket';
import type { reportDatasetMetadata } from '@/db/schema';
import { BIDBEACON_REALTIME_PROTOCOL } from '@/realtime-protocol';
import { apiBaseUrl } from '../../router';
import { useRealtimeTicket } from './use-realtime-ticket';

const API_PROTOCOL_REGEX = /^https?/;

type Event =
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
    | {
          type: 'report-dataset-metadata:error';
          data: {
              accountId: string;
              countryCode: string;
              periodStart: string;
              aggregation: 'hourly' | 'daily';
              entityType: 'target';
              error: string;
          };
          timestamp: string;
      }
    | { type: 'account-dataset-metadata:updated'; accountId: string; countryCode: string; timestamp: string }
    | { type: 'reports:refreshed'; accountId: string; timestamp: string }
    | { type: 'report:refreshed'; row: InferSelectModel<typeof reportDatasetMetadata>; timestamp: string }
    | { type: 'account:updated'; accountId: string; enabled: boolean; timestamp: string }
    | { type: 'error'; message: string; details?: string; timestamp: string }
    | { type: 'pong' };

/**
 * Hook to listen for specific WebSocket events
 * Uses the shared WebSocket connection from react-use-websocket
 * @param eventType - The type of event to listen for
 * @param handler - Callback function that receives the event data
 */
export const useWebSocketEvents = <T extends Event['type']>(eventType: T, handler: (event: Extract<Event, { type: T }>) => void): void => {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    const { refresh, ticket } = useRealtimeTicket();

    // Compute WebSocket URL lazily inside the hook to avoid initialization order issues
    const wsUrl = `${apiBaseUrl.replace(API_PROTOCOL_REGEX, (match: string) => (match === 'https' ? 'wss' : 'ws'))}/api/events`;

    useWebSocketLib(ticket ? wsUrl : null, {
        onMessage: event => {
            try {
                const data: Event = JSON.parse(event.data);
                if (data.type === eventType) {
                    handlerRef.current(data as Extract<Event, { type: T }>);
                }
            } catch {
                // Ignore malformed messages
            }
        },
        onClose: () => {
            refresh().catch(() => undefined);
        },
        protocols: ticket ? [BIDBEACON_REALTIME_PROTOCOL, ticket] : undefined,
        shouldReconnect: () => false,
        share: true, // Share connection with other hooks
    });
};

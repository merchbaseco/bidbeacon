import type { WebSocket } from 'ws';

export type EventType =
    | 'error'
    | 'account:updated'
    | 'reports:refreshed'
    | 'api-metrics:updated'
    | 'account-dataset-metadata:updated'
    | 'report-refresh:started'
    | 'report-refresh:completed'
    | 'report-refresh:failed';

export interface BaseEvent {
    type: EventType;
    timestamp: string;
}

export interface ErrorEvent extends BaseEvent {
    type: 'error';
    message: string;
    details?: string;
}

export interface AccountUpdatedEvent extends BaseEvent {
    type: 'account:updated';
    accountId: string;
    enabled: boolean;
}

export interface ReportsRefreshedEvent extends BaseEvent {
    type: 'reports:refreshed';
    accountId: string;
}

export interface ApiMetricsUpdatedEvent extends BaseEvent {
    type: 'api-metrics:updated';
    apiName: string;
}

export interface AccountDatasetMetadataUpdatedEvent extends BaseEvent {
    type: 'account-dataset-metadata:updated';
    accountId: string;
    countryCode: string;
}

export interface ReportRefreshStartedEvent extends BaseEvent {
    type: 'report-refresh:started';
    accountId: string;
    countryCode: string;
    rowTimestamp: string; // row timestamp (ISO string)
    aggregation: 'hourly' | 'daily';
    entityType: 'target' | 'product';
}

export interface ReportRefreshCompletedEvent extends BaseEvent {
    type: 'report-refresh:completed';
    accountId: string;
    countryCode: string;
    rowTimestamp: string; // row timestamp (ISO string)
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

export interface ReportRefreshFailedEvent extends BaseEvent {
    type: 'report-refresh:failed';
    accountId: string;
    countryCode: string;
    rowTimestamp: string;
    aggregation: 'hourly' | 'daily';
    entityType: 'target' | 'product';
    error: string;
}

export type Event =
    | ErrorEvent
    | AccountUpdatedEvent
    | ReportsRefreshedEvent
    | ApiMetricsUpdatedEvent
    | AccountDatasetMetadataUpdatedEvent
    | ReportRefreshStartedEvent
    | ReportRefreshCompletedEvent
    | ReportRefreshFailedEvent;

/**
 * Singleton event emitter for WebSocket connections
 */
class EventEmitter {
    private connections: Set<WebSocket> = new Set();

    constructor() {
        // Clean up dead connections every 30 seconds
        setInterval(() => {
            for (const socket of this.connections) {
                if (socket.readyState !== 1) {
                    this.connections.delete(socket);
                }
            }
        }, 30000);
    }

    /**
     * Add a WebSocket connection to the emitter
     */
    addConnection(socket: WebSocket) {
        socket.on('close', () => {
            this.connections.delete(socket);
        });

        socket.on('error', error => {
            console.error('[Events] WebSocket error:', error);
            this.connections.delete(socket);
        });

        if (socket.readyState === 1) {
            this.connections.add(socket);
        }
    }

    /**
     * Emit an event to all connected clients
     */
    emitEvent(event: Event) {
        const message = JSON.stringify(event);
        const connectionCount = this.connections.size;
        console.log(`[Events] Emitting event ${event.type} to ${connectionCount} connected client(s)`);

        let sentCount = 0;
        for (const socket of this.connections) {
            try {
                if (socket.readyState === 1) {
                    socket.send(message);
                    sentCount++;
                } else {
                    this.connections.delete(socket);
                }
            } catch (error) {
                console.error('[Events] Failed to send message:', error);
                this.connections.delete(socket);
            }
        }
        console.log(`[Events] Event ${event.type} sent to ${sentCount} client(s)`);
    }
}

// Singleton instance
const eventEmitter = new EventEmitter();

/**
 * Utility function to emit events easily from anywhere in the codebase
 * Uses function overloads to preserve discriminated union types
 */
export function emitEvent(event: Omit<ErrorEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<AccountUpdatedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<ReportsRefreshedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<ApiMetricsUpdatedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<AccountDatasetMetadataUpdatedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<ReportRefreshStartedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<ReportRefreshCompletedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<ReportRefreshFailedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<Event, 'timestamp'>): void {
    const eventWithTimestamp: Event = {
        ...event,
        timestamp: new Date().toISOString(),
    } as Event;

    eventEmitter.emitEvent(eventWithTimestamp);
}

/**
 * Register a WebSocket connection with the event emitter
 */
export function registerWebSocketConnection(socket: WebSocket) {
    eventEmitter.addConnection(socket);
}

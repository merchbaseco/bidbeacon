import type { InferSelectModel } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import type { reportDatasetMetadata } from '@/db/schema';

interface AuthenticatedConnection {
    socket: WebSocket;
    accessibleAccountIds: string[];
}

export type EventType =
    | 'error'
    | 'account:updated'
    | 'reports:refreshed'
    | 'api-metrics:updated'
    | 'job-metrics:updated'
    | 'events:updated'
    | 'account-dataset-metadata:updated'
    | 'report:refreshed'
    | 'report-dataset-metadata:error';

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

export interface JobMetricsUpdatedEvent extends BaseEvent {
    type: 'job-metrics:updated';
    jobName: string;
}

export interface EventsUpdatedEvent extends BaseEvent {
    type: 'events:updated';
    accountId: string | null;
}

export interface AccountDatasetMetadataUpdatedEvent extends BaseEvent {
    type: 'account-dataset-metadata:updated';
    accountId: string;
    countryCode: string;
}

export interface ReportRefreshedEvent extends BaseEvent {
    type: 'report:refreshed';
    row: InferSelectModel<typeof reportDatasetMetadata>;
}

export interface ReportDatasetMetadataErrorEvent extends BaseEvent {
    type: 'report-dataset-metadata:error';
    data: {
        accountId: string;
        countryCode: string;
        periodStart: string;
        aggregation: 'hourly' | 'daily';
        entityType: 'target' | 'product';
        error: string;
    };
}

export type Event =
    | ErrorEvent
    | AccountUpdatedEvent
    | ReportsRefreshedEvent
    | ApiMetricsUpdatedEvent
    | JobMetricsUpdatedEvent
    | EventsUpdatedEvent
    | AccountDatasetMetadataUpdatedEvent
    | ReportRefreshedEvent
    | ReportDatasetMetadataErrorEvent;

/**
 * Extract accountId from an event if it has one
 */
const getEventAccountId = (event: Event): string | null => {
    if ('accountId' in event) return event.accountId;
    if ('row' in event && event.row && 'accountId' in event.row) return event.row.accountId;
    if ('data' in event && event.data && 'accountId' in event.data) return (event.data as { accountId?: string }).accountId ?? null;
    return null;
};

/**
 * Singleton event emitter for WebSocket connections
 */
class EventEmitter {
    private connections: Map<WebSocket, AuthenticatedConnection> = new Map();

    constructor() {
        // Clean up dead connections every 30 seconds
        setInterval(() => {
            for (const [socket] of this.connections) {
                if (socket.readyState !== 1) {
                    this.connections.delete(socket);
                }
            }
        }, 30000);
    }

    /**
     * Add an authenticated WebSocket connection to the emitter
     */
    addConnection(socket: WebSocket, accessibleAccountIds: string[]) {
        socket.on('close', () => {
            this.connections.delete(socket);
        });

        socket.on('error', error => {
            console.error('WebSocket error', error);
            this.connections.delete(socket);
        });

        if (socket.readyState === 1) {
            this.connections.set(socket, { socket, accessibleAccountIds });
        }
    }

    /**
     * Emit an event to connected clients that have access to the event's account
     */
    emitEvent(event: Event) {
        const message = JSON.stringify(event);
        const eventAccountId = getEventAccountId(event);

        for (const [socket, connection] of this.connections) {
            try {
                if (socket.readyState !== 1) {
                    this.connections.delete(socket);
                    continue;
                }

                // If event has an accountId, only send to connections with access
                if (eventAccountId && !connection.accessibleAccountIds.includes(eventAccountId)) {
                    continue;
                }

                socket.send(message);
            } catch (error) {
                console.error(`Failed to send websocket message for event ${event.type}`, error);
                this.connections.delete(socket);
            }
        }
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
export function emitEvent(event: Omit<JobMetricsUpdatedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<EventsUpdatedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<AccountDatasetMetadataUpdatedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<ReportRefreshedEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<ReportDatasetMetadataErrorEvent, 'timestamp'>): void;
export function emitEvent(event: Omit<Event, 'timestamp'>): void {
    const eventWithTimestamp: Event = {
        ...event,
        timestamp: new Date().toISOString(),
    } as Event;

    eventEmitter.emitEvent(eventWithTimestamp);
}

/**
 * Register an authenticated WebSocket connection with the event emitter
 */
export function registerWebSocketConnection(socket: WebSocket, accessibleAccountIds: string[]) {
    eventEmitter.addConnection(socket, accessibleAccountIds);
}

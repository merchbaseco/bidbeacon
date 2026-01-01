import type { InferSelectModel } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import type { reportDatasetMetadata } from '@/db/schema';

export type EventType =
    | 'error'
    | 'account:updated'
    | 'reports:refreshed'
    | 'api-metrics:updated'
    | 'job-metrics:updated'
    | 'job-events:updated'
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

export interface JobEventsUpdatedEvent extends BaseEvent {
    type: 'job-events:updated';
    jobName: string;
    event: {
        id: string;
        sessionId: string;
        bossJobId: string;
        occurredAt: string;
        eventType: string;
        message: string;
        detail: string | null;
        stage: string | null;
        status: string | null;
        durationMs: number | null;
        rowCount: number | null;
        retryCount: number | null;
        apiName: string | null;
        accountId: string | null;
        countryCode: string | null;
        datasetId: string | null;
        entityType: string | null;
        aggregation: string | null;
        bucketDate: string | null;
        bucketStart: string | null;
        metadata: Record<string, unknown> | null;
    };
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
    | JobEventsUpdatedEvent
    | AccountDatasetMetadataUpdatedEvent
    | ReportRefreshedEvent
    | ReportDatasetMetadataErrorEvent;

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
            console.error('WebSocket error', error);
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

        let _sentCount = 0;
        for (const socket of this.connections) {
            try {
                if (socket.readyState === 1) {
                    socket.send(message);
                    _sentCount++;
                } else {
                    this.connections.delete(socket);
                }
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
export function emitEvent(event: Omit<JobEventsUpdatedEvent, 'timestamp'>): void;
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
 * Register a WebSocket connection with the event emitter
 */
export function registerWebSocketConnection(socket: WebSocket) {
    eventEmitter.addConnection(socket);
}

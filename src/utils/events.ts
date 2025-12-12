import type { SocketStream } from '@fastify/websocket';

export type EventType = 'error' | 'account:updated';

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

export type Event = ErrorEvent | AccountUpdatedEvent;

/**
 * Singleton event emitter for WebSocket connections
 */
class EventEmitter {
    private connections: Set<SocketStream> = new Set();

    /**
     * Add a WebSocket connection to the emitter
     */
    addConnection(connection: SocketStream) {
        console.log('=== ADD CONNECTION CALLED ===');
        this.connections.add(connection);
        console.log(`[Events] Connected. Total: ${this.connections.size}`);

        connection.socket.on('close', (code, reason) => {
            console.log(`[Events] CLOSED. Code: ${code}, Reason: ${reason}`);
            this.connections.delete(connection);
            console.log(`[Events] Removed. Total: ${this.connections.size}`);
        });

        connection.socket.on('error', error => {
            console.error('[Events] ERROR:', error);
        });
    }

    /**
     * Emit an event to all connected clients
     */
    emitEvent(event: Event) {
        const message = JSON.stringify(event);
        let sentCount = 0;

        for (const connection of this.connections) {
            try {
                if (connection.socket.readyState === 1) {
                    // WebSocket.OPEN = 1
                    connection.socket.send(message);
                    sentCount++;
                } else {
                    // Connection is not open, remove it
                    this.connections.delete(connection);
                }
            } catch (error) {
                console.error('[Events] Error sending message to client:', error);
                this.connections.delete(connection);
            }
        }

        if (sentCount > 0) {
            console.log(`[Events] Emitted ${event.type} to ${sentCount} client(s)`);
        }
    }
}

// Singleton instance
const eventEmitter = new EventEmitter();

/**
 * Utility function to emit events easily from anywhere in the codebase
 */
export function emitEvent(event: Omit<Event, 'timestamp'>) {
    const eventWithTimestamp: Event = {
        ...event,
        timestamp: new Date().toISOString(),
    } as Event;

    eventEmitter.emitEvent(eventWithTimestamp);
}

/**
 * Register a WebSocket connection with the event emitter
 */
export function registerWebSocketConnection(connection: SocketStream) {
    eventEmitter.addConnection(connection);
}

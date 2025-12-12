import type { WebSocket } from 'ws';

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
    private connections: Set<WebSocket> = new Set();

    constructor() {
        // Clean up dead connections every 30 seconds
        this.cleanupInterval = setInterval(() => {
            const before = this.connections.size;
            for (const socket of this.connections) {
                if (socket.readyState !== 1) {
                    // Connection is not OPEN, remove it
                    this.connections.delete(socket);
                    console.log(
                        `[Events] Cleanup: Removed dead connection. ReadyState: ${socket.readyState}`
                    );
                }
            }
            const after = this.connections.size;
            if (before !== after) {
                console.log(`[Events] Cleanup: ${before} -> ${after} connections`);
            }
        }, 30000);
    }

    /**
     * Add a WebSocket connection to the emitter
     */
    addConnection(socket: WebSocket) {
        // Attach handlers for cleanup
        socket.on('close', (code, reason) => {
            console.log(`[Events] Connection closed. Code: ${code}, Reason: ${reason}`);
            this.connections.delete(socket);
            console.log(`[Events] Removed. Total: ${this.connections.size}`);
        });

        socket.on('error', error => {
            console.error('[Events] Connection error:', error);
            this.connections.delete(socket);
        });

        // Only add if connection is still open
        if (socket.readyState === 1) {
            this.connections.add(socket);
            console.log(`[Events] Connected. Total: ${this.connections.size}`);
        } else {
            console.log(`[Events] Connection not open (${socket.readyState}), not adding`);
        }
    }

    /**
     * Emit an event to all connected clients
     */
    emitEvent(event: Event) {
        const message = JSON.stringify(event);
        let sentCount = 0;

        for (const socket of this.connections) {
            try {
                if (socket.readyState === 1) {
                    // WebSocket.OPEN = 1
                    socket.send(message);
                    sentCount++;
                } else {
                    // Connection is not open, remove it
                    this.connections.delete(socket);
                }
            } catch (error) {
                console.error('[Events] Error sending message to client:', error);
                this.connections.delete(socket);
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
export function registerWebSocketConnection(socket: WebSocket) {
    eventEmitter.addConnection(socket);
}

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ConnectionStatus } from './websocket-manager';
import { websocketManager } from './websocket-manager';

export type { ConnectionStatus };

export function useWebSocket(): ConnectionStatus {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');

    useEffect(() => {
        console.log('[useWebSocket] Effect running');
        // Set query client for event handling
        websocketManager.setQueryClient(queryClient);

        // Subscribe to status updates
        const unsubscribe = websocketManager.subscribe(setStatus);

        return () => {
            console.log('[useWebSocket] Effect cleanup running');
            unsubscribe();
        };
    }, [queryClient]);

    return status;
}

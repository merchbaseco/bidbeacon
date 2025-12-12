import { cn } from '../lib/utils';
import type { ConnectionStatus } from '../routes/hooks/use-websocket';
import { Badge } from './ui/badge';

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
    const statusConfig = {
        connected: { label: 'Connected', variant: 'success' as const },
        connecting: { label: 'Connecting...', variant: 'info' as const },
        disconnected: { label: 'Disconnected', variant: 'error' as const },
    };

    const config = statusConfig[status];

    return (
        <Badge variant={config.variant} size="lg" className="bg-transparent px-0">
            <span
                className={cn(
                    'mr-0.5 h-1.5 w-1.5 rounded-full',
                    status === 'connected'
                        ? 'bg-success animate-pulse'
                        : status === 'connecting'
                          ? 'bg-info animate-pulse'
                          : 'bg-destructive'
                )}
            />
            {config.label}
        </Badge>
    );
}

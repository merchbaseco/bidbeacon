import { cn } from '../lib/utils';
import type { ConnectionStatus } from '../routes/atoms';
import { Badge } from './ui/badge';

export function ConnectionStatusBadge({ status, className }: { status: ConnectionStatus; className?: string }) {
    const statusConfig = {
        connected: { label: 'Connected', variant: 'success' as const },
        connecting: { label: 'Connecting...', variant: 'info' as const },
        disconnected: { label: 'Disconnected', variant: 'error' as const },
    };

    const config = statusConfig[status];

    return (
        <Badge variant={config.variant} size="lg" className={className}>
            <span className={cn('mr-0.5 h-1.5 w-1.5 rounded-full', status === 'connected' ? 'bg-success animate-pulse' : status === 'connecting' ? 'bg-info animate-pulse' : 'bg-destructive')} />
            {config.label}
        </Badge>
    );
}

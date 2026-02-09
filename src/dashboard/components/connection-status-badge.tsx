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
        <Badge className={className} size="lg" variant={config.variant}>
            <span className={cn('mr-0.5 h-1.5 w-1.5 rounded-full', status === 'connected' ? 'animate-pulse bg-success' : status === 'connecting' ? 'animate-pulse bg-info' : 'bg-destructive')} />
            {config.label}
        </Badge>
    );
}

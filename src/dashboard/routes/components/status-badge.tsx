import { Badge } from '../../components/ui/badge';

interface StatusBadgeProps {
    status: string;
}

function getStatusVariant(status: string): 'success' | 'error' | 'warning' | 'outline' {
    switch (status) {
        case 'completed':
            return 'success';
        case 'failed':
            return 'error';
        case 'fetching':
            return 'warning';
        case 'missing':
            return 'warning';
        default:
            return 'outline';
    }
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const variant = getStatusVariant(status);
    const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);

    return <Badge variant={variant}>{displayStatus}</Badge>;
}

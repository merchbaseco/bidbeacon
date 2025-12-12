import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowReloadHorizontalSolidRounded } from '@merchbaseco/icons/core-solid-rounded';
import {
    AlertCircleIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    FilterIcon,
    Loader2Icon,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '../../components/ui/button-group';
import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';

const STATUS_OPTIONS = [
    { icon: FilterIcon, label: 'All Statuses', value: 'all' },
    { icon: CheckCircleIcon, label: 'Completed', value: 'completed' },
    { icon: AlertCircleIcon, label: 'Failed', value: 'failed' },
    { icon: Loader2Icon, label: 'Fetching', value: 'fetching' },
    { icon: AlertTriangleIcon, label: 'Missing', value: 'missing' },
] as const;

interface ReportsToolbarProps {
    aggregation: 'daily' | 'hourly';
    statusFilter: string;
    isLoading: boolean;
    onAggregationChange: (value: 'daily' | 'hourly') => void;
    onStatusFilterChange: (value: string) => void;
    onRefresh: () => void;
}

export const ReportsToolbar = ({
    aggregation,
    statusFilter,
    isLoading,
    onAggregationChange,
    onStatusFilterChange,
    onRefresh,
}: ReportsToolbarProps) => {
    return (
        <div className="mb-4 flex items-center gap-2">
            <ButtonGroup>
                <Button
                    variant={aggregation === 'daily' ? 'default' : 'outline'}
                    onClick={() => onAggregationChange('daily')}
                >
                    Daily
                </Button>
                <Button
                    variant={aggregation === 'hourly' ? 'default' : 'outline'}
                    onClick={() => onAggregationChange('hourly')}
                >
                    Hourly
                </Button>
            </ButtonGroup>
            <ButtonGroupSeparator />
            <Select
                aria-label="Select status"
                value={statusFilter}
                onValueChange={value => {
                    if (value !== null) {
                        onStatusFilterChange(value);
                    }
                }}
            >
                <SelectTrigger className="w-[180px]">
                    <SelectValue>
                        {value => {
                            const option = STATUS_OPTIONS.find(opt => opt.value === value);
                            if (!option) return null;
                            return (
                                <span className="flex items-center gap-2">
                                    <option.icon className="size-4 opacity-72" />
                                    <span className="truncate">{option.label}</span>
                                </span>
                            );
                        }}
                    </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {STATUS_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                            <span className="flex items-center gap-2">
                                <option.icon className="size-4 opacity-72" />
                                <span className="truncate">{option.label}</span>
                            </span>
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
            <ButtonGroup className="ml-auto">
                <Button
                    variant="ghost"
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2"
                >
                    <HugeiconsIcon
                        icon={ArrowReloadHorizontalSolidRounded}
                        size={16}
                        color="currentColor"
                    />
                </Button>
            </ButtonGroup>
        </div>
    );
};

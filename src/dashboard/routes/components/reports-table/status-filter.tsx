import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, FilterIcon, Loader2Icon } from 'lucide-react';
import { useAtom, useSetAtom } from 'jotai';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { offsetAtom, statusFilterAtom } from './atoms';

const STATUS_OPTIONS = [
    { icon: FilterIcon, label: 'All Statuses', value: 'all' },
    { icon: CheckCircleIcon, label: 'Completed', value: 'completed' },
    { icon: AlertCircleIcon, label: 'Failed', value: 'failed' },
    { icon: Loader2Icon, label: 'Fetching', value: 'fetching' },
    { icon: Loader2Icon, label: 'Parsing', value: 'parsing' },
    { icon: AlertTriangleIcon, label: 'Missing', value: 'missing' },
] as const;

export const StatusFilter = () => {
    const [statusFilter, setStatusFilter] = useAtom(statusFilterAtom);
    const setOffset = useSetAtom(offsetAtom);

    return (
        <Select
            aria-label="Select status"
            value={statusFilter}
            onValueChange={value => {
                if (value !== null) {
                    setStatusFilter(value);
                    setOffset(0);
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
    );
};


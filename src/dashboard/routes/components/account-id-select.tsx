import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';

type AccountIdSelectProps = {
    value: string;
    onValueChange: (value: string) => void;
    accountIds: string[];
    disabled?: boolean;
};

export function AccountIdSelect({
    value,
    onValueChange,
    accountIds,
    disabled,
}: AccountIdSelectProps) {
    return (
        <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">Account ID</div>
            <Select value={value} onValueChange={v => v && onValueChange(v)} disabled={disabled}>
                <SelectTrigger>
                    <SelectValue>{v => v || 'Select an account'}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {accountIds.map(id => (
                        <SelectItem key={id} value={id}>
                            {id}
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
        </div>
    );
}

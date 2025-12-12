import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';
import type { AdvertisingAccount } from '../hooks/use-advertising-accounts';

type CountryProfileSelectProps = {
    value: string;
    onValueChange: (value: string) => void;
    rows: AdvertisingAccount[];
    disabled?: boolean;
};

const formatLabel = (a: {
    countryCode: string;
    profileId: string | null;
    entityId: string | null;
}) =>
    [a.countryCode, a.profileId && `Profile ${a.profileId}`, a.entityId && `Entity ${a.entityId}`]
        .filter(Boolean)
        .join(' - ');

export function CountryProfileSelect({
    value,
    onValueChange,
    rows,
    disabled,
}: CountryProfileSelectProps) {
    return (
        <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">Country / Profile</div>
            <Select value={value} onValueChange={v => v && onValueChange(v)} disabled={disabled}>
                <SelectTrigger>
                    <SelectValue>
                        {v => {
                            const row = rows.find(r => r.id === v);
                            return row ? formatLabel(row) : 'Select country/profile';
                        }}
                    </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {rows.map(row => (
                        <SelectItem key={row.id} value={row.id}>
                            {formatLabel(row)}
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
        </div>
    );
}

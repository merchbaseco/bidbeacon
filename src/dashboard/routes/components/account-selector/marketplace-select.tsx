import { useAtom } from 'jotai';
import { useMemo } from 'react';
import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import { useAdvertisingAccounts } from '../../hooks/use-advertising-accounts';
import { selectedAccountIdAtom, selectedProfileIdAtom } from './atoms';

const getCountryName = (countryCode: string): string => {
    try {
        return new Intl.DisplayNames('en', { type: 'region' }).of(countryCode) || countryCode;
    } catch {
        return countryCode;
    }
};

export function MarketplaceSelect({ disabled }: { disabled?: boolean }) {
    const { data: accounts = [], isLoading } = useAdvertisingAccounts();
    const [accountId] = useAtom(selectedAccountIdAtom);
    const [profileId, setProfileId] = useAtom(selectedProfileIdAtom);

    const rows = useMemo(
        () =>
            accountId
                ? accounts
                      .filter(a => a.adsAccountId === accountId && a.profileId !== null)
                      .sort((a, b) => a.countryCode.localeCompare(b.countryCode))
                : [],
        [accounts, accountId]
    );

    const selectedRow = rows.find(r => r.profileId === profileId);

    return (
        <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">Marketplace</div>
            <Select
                value={profileId || ''}
                onValueChange={v => v && setProfileId(v)}
                disabled={disabled || isLoading || !accountId || !rows.length}
            >
                <SelectTrigger>
                    <SelectValue>
                        {_v =>
                            selectedRow
                                ? getCountryName(selectedRow.countryCode)
                                : 'Select marketplace'
                        }
                    </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {rows.map(row => (
                        <SelectItem key={row.profileId} value={row.profileId!}>
                            {getCountryName(row.countryCode)}
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
        </div>
    );
}

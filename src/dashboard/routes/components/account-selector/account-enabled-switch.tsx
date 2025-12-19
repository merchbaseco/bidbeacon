import { useAtom } from 'jotai';
import { Switch } from '../../../components/ui/switch';
import { useAdvertisingAccounts } from '../../hooks/use-advertising-accounts';
import { selectedAccountIdAtom, selectedProfileIdAtom } from './atoms';

export function AccountEnabledSwitch() {
    const { data: accounts = [], toggle } = useAdvertisingAccounts();
    const [accountId] = useAtom(selectedAccountIdAtom);
    const [profileId] = useAtom(selectedProfileIdAtom);

    const selectedRow = accounts.find(a => a.adsAccountId === accountId && a.profileId === profileId);

    return (
        <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Sync Account</div>
            {selectedRow && (
                <Switch
                    checked={selectedRow.enabled}
                    onCheckedChange={() => {
                        if (selectedRow.profileId) {
                            toggle({
                                adsAccountId: selectedRow.adsAccountId,
                                profileId: selectedRow.profileId,
                                enabled: !selectedRow.enabled,
                            });
                        }
                    }}
                />
            )}
        </div>
    );
}

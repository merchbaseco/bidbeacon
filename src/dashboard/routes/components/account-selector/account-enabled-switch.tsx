import { useAtom } from 'jotai';
import { Switch } from '../../../components/ui/switch';
import { useAdvertisingAccounts } from '../../hooks/use-advertising-accounts';
import { selectedAccountIdAtom, selectedProfileIdAtom } from './atoms';

export const AccountEnabledSwitch = () => {
    const { data: accounts = [], toggle } = useAdvertisingAccounts();
    const [accountId] = useAtom(selectedAccountIdAtom);
    const [profileId] = useAtom(selectedProfileIdAtom);

    const selectedRow = accounts.find(a => a.adsAccountId === accountId && a.profileId === profileId);

    if (!selectedRow) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <div className="font-medium text-muted-foreground text-sm">Sync</div>
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
        </div>
    );
};

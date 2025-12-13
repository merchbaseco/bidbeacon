import { useAtom } from 'jotai';
import { Switch } from '../../../components/ui/switch';
import { useAdvertisingAccounts, useToggleAdvertisingAccount } from '../../hooks/use-advertising-accounts';
import { selectedAccountIdAtom, selectedProfileIdAtom } from './atoms';

export function AccountEnabledSwitch() {
    const { data: accounts = [] } = useAdvertisingAccounts();
    const toggleMutation = useToggleAdvertisingAccount();
    const [accountId] = useAtom(selectedAccountIdAtom);
    const [profileId] = useAtom(selectedProfileIdAtom);

    const selectedRow = accounts.find(a => a.adsAccountId === accountId && a.profileId === profileId);

    if (!selectedRow) return null;

    return (
        <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Sync Account</div>
            <Switch
                checked={selectedRow.enabled}
                onCheckedChange={() => {
                    if (selectedRow.profileId) {
                        toggleMutation.mutate({
                            adsAccountId: selectedRow.adsAccountId,
                            profileId: selectedRow.profileId,
                            enabled: !selectedRow.enabled,
                        });
                    }
                }}
                disabled={toggleMutation.isPending}
            />
        </div>
    );
}

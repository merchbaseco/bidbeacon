import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Label } from '../../components/Label';
import { Select } from '../../components/Select';
import { api } from '../../lib/trpc.js';
import { useRefreshReportsTable } from '../hooks/use-refresh-reports-table.js';
import { useSearchParamsState } from '../hooks/use-search-params.js';

type Aggregation = 'daily' | 'hourly';

interface SearchControlsProps {
    accountId: string;
    aggregation: Aggregation;
    days: number;
}

export function SearchControls({ accountId, aggregation, days }: SearchControlsProps) {
    const utils = api.useUtils();
    const { updateSearch } = useSearchParamsState();
    const { refreshReportsTable, pending } = useRefreshReportsTable(accountId);
    return (
        <div>
            <Label>
                Account ID
                <Input value={accountId} onChange={event => updateSearch({ accountId: event.target.value })} />
            </Label>

            <Label>
                Aggregation
                <Select value={aggregation} onChange={event => updateSearch({ aggregation: event.target.value as Aggregation })}>
                    <option value="daily">Daily</option>
                    <option value="hourly">Hourly</option>
                </Select>
            </Label>

            <Label>
                Range
                <Select value={String(days)} onChange={event => updateSearch({ days: Number(event.target.value) })}>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="60">Last 60 days</option>
                    <option value="90">Last 90 days</option>
                </Select>
            </Label>

            <div>
                <Button type="button" onClick={refreshReportsTable} disabled={pending}>
                    {pending ? 'Queuing…' : 'Trigger Update'}
                </Button>
                <Button variant="secondary" type="button" onClick={() => utils.reports.status.invalidate()} disabled={pending}>
                    Refresh
                </Button>
            </div>
        </div>
    );
}

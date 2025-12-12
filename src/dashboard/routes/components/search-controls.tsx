import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Label } from '../../components/Label';
import { Select } from '../../components/Select';
import { queryKeys } from '../hooks/query-keys.js';
import { useSearchParamsState } from '../hooks/use-search-params.js';
import { useTriggerUpdate } from '../hooks/use-trigger-update.js';

type Aggregation = 'daily' | 'hourly';

interface SearchControlsProps {
    accountId: string;
    aggregation: Aggregation;
    days: number;
}

export function SearchControls({ accountId, aggregation, days }: SearchControlsProps) {
    const { updateSearch } = useSearchParamsState();
    const { triggerUpdate, pending } = useTriggerUpdate(accountId);
    const queryClient = useQueryClient();
    return (
        <div>
            <Label>
                Account ID
                <Input
                    value={accountId}
                    onChange={event => updateSearch({ accountId: event.target.value })}
                />
            </Label>

            <Label>
                Aggregation
                <Select
                    value={aggregation}
                    onChange={event =>
                        updateSearch({ aggregation: event.target.value as Aggregation })
                    }
                >
                    <option value="daily">Daily</option>
                    <option value="hourly">Hourly</option>
                </Select>
            </Label>

            <Label>
                Range
                <Select
                    value={String(days)}
                    onChange={event => updateSearch({ days: Number(event.target.value) })}
                >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="60">Last 60 days</option>
                    <option value="90">Last 90 days</option>
                </Select>
            </Label>

            <div>
                <Button type="button" onClick={triggerUpdate} disabled={pending}>
                    {pending ? 'Queuing…' : 'Trigger Update'}
                </Button>
                <Button
                    variant="secondary"
                    type="button"
                    onClick={() =>
                        queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStatusAll() })
                    }
                    disabled={pending}
                >
                    Refresh
                </Button>
            </div>
        </div>
    );
}

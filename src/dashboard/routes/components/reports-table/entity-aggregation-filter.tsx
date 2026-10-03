import { useAtom, useSetAtom } from 'jotai';
import { ToggleGroup, ToggleGroupItem } from '../../../components/ui/toggle-group';
import { aggregationAtom, offsetAtom } from './atoms';

export const EntityAggregationFilter = () => {
    const [aggregation, setAggregation] = useAtom(aggregationAtom);
    const setOffset = useSetAtom(offsetAtom);

    const handleValueChange = (value: unknown[]) => {
        const next = value[0];
        // A segmented control always keeps one choice; ignore attempts to deselect.
        if (next !== 'daily' && next !== 'hourly') {
            return;
        }
        setAggregation(next);
        setOffset(0);
    };

    return (
        <ToggleGroup aria-label="Aggregation" className="ink-raised ink-segmented" onValueChange={handleValueChange} size="sm" value={[aggregation]}>
            <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
            <ToggleGroupItem value="hourly">Hourly</ToggleGroupItem>
        </ToggleGroup>
    );
};

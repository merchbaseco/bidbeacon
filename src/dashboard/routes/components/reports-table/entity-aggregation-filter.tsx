import { useAtom, useSetAtom } from 'jotai';
import { Button } from '../../../components/ui/button';
import { ButtonGroup } from '../../../components/ui/button-group';
import { aggregationAtom, offsetAtom } from './atoms';

export const EntityAggregationFilter = () => {
    const [aggregation, setAggregation] = useAtom(aggregationAtom);
    const setOffset = useSetAtom(offsetAtom);

    const handleChange = (value: 'daily' | 'hourly') => {
        setAggregation(value);
        setOffset(0);
    };

    return (
        <ButtonGroup>
            <Button onClick={() => handleChange('daily')} size="sm" variant={aggregation === 'daily' ? 'default' : 'outline'}>
                Daily
            </Button>
            <Button onClick={() => handleChange('hourly')} size="sm" variant={aggregation === 'hourly' ? 'default' : 'outline'}>
                Hourly
            </Button>
        </ButtonGroup>
    );
};

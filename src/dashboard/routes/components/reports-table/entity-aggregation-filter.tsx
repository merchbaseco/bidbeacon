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
            <Button variant={aggregation === 'daily' ? 'default' : 'outline'} onClick={() => handleChange('daily')}>
                Daily
            </Button>
            <Button variant={aggregation === 'hourly' ? 'default' : 'outline'} onClick={() => handleChange('hourly')}>
                Hourly
            </Button>
        </ButtonGroup>
    );
};


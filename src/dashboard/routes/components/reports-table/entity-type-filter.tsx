import { useAtom, useSetAtom } from 'jotai';
import { Button } from '../../../components/ui/button';
import { ButtonGroup } from '../../../components/ui/button-group';
import { entityTypeAtom, offsetAtom } from './atoms';

export const EntityTypeFilter = () => {
    const [entityType, setEntityType] = useAtom(entityTypeAtom);
    const setOffset = useSetAtom(offsetAtom);

    const handleChange = (value: 'target' | 'product') => {
        setEntityType(value);
        setOffset(0);
    };

    return (
        <ButtonGroup>
            <Button onClick={() => handleChange('target')} size="sm" variant={entityType === 'target' ? 'default' : 'outline'}>
                Target
            </Button>
            <Button onClick={() => handleChange('product')} size="sm" variant={entityType === 'product' ? 'default' : 'outline'}>
                Product
            </Button>
        </ButtonGroup>
    );
};

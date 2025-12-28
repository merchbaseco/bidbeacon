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
            <Button size="xs" variant={entityType === 'target' ? 'default' : 'outline'} onClick={() => handleChange('target')}>
                Target
            </Button>
            <Button size="xs" variant={entityType === 'product' ? 'default' : 'outline'} onClick={() => handleChange('product')}>
                Product
            </Button>
        </ButtonGroup>
    );
};


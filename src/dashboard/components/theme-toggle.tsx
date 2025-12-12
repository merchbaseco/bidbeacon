import { HugeiconsIcon } from '@hugeicons/react';
import Moon02Icon from '@merchbaseco/icons/core-solid-rounded/Moon02Icon';
import { useEffect, useState } from 'react';
import { useTheme } from '../routes/hooks/use-theme';
import { Button } from './ui/button';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={toggleTheme} size="icon">
                <HugeiconsIcon icon={Moon02Icon} size={24} />
            </Button>
        </div>
    );
}

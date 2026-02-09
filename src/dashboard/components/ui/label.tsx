import type { ComponentProps } from 'react';

import { cn } from '../../lib/utils';

function Label({ className, children, htmlFor, ...props }: ComponentProps<'label'>) {
    return (
        <label className={cn('inline-flex items-center gap-2 text-sm/4', className)} data-slot="label" htmlFor={htmlFor} {...props}>
            {children}
        </label>
    );
}

export { Label };

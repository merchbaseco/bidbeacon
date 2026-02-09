import { mergeProps } from '@base-ui-components/react/merge-props';
import { useRender } from '@base-ui-components/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { Separator } from './separator';

const buttonGroupVariants = cva(
    "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
    {
        variants: {
            orientation: {
                horizontal: '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
                vertical: 'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
            },
        },
        defaultVariants: {
            orientation: 'horizontal',
        },
    }
);

function ButtonGroup({ className, orientation, ...props }: ComponentProps<'fieldset'> & VariantProps<typeof buttonGroupVariants>) {
    return <fieldset className={cn(buttonGroupVariants({ orientation }), className)} data-orientation={orientation} data-slot="button-group" {...props} />;
}

interface ButtonGroupTextProps extends useRender.ComponentProps<'div'> {}

function ButtonGroupText({ className, render, ...props }: ButtonGroupTextProps) {
    const defaultProps = {
        className: cn("flex items-center gap-2 rounded-md border bg-muted px-4 font-medium text-sm shadow-xs [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none", className),
    };

    return useRender({
        defaultTagName: 'div',
        props: mergeProps<'div'>(defaultProps, props),
        render,
    });
}

function ButtonGroupSeparator({ className, orientation = 'vertical', ...props }: ComponentProps<typeof Separator>) {
    return <Separator className={cn('relative m-0! self-stretch bg-input data-[orientation=vertical]:h-auto', className)} data-slot="button-group-separator" orientation={orientation} {...props} />;
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };

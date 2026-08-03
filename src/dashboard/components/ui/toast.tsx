'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, ArrowReloadHorizontalIcon, CheckmarkCircle04Icon, InformationCircleIcon, RemoveCircleIcon } from '@hugeicons-pro/core-solid-rounded';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            className="toaster group"
            icons={{
                success: <HugeiconsIcon icon={CheckmarkCircle04Icon} size={16} />,
                info: <HugeiconsIcon icon={InformationCircleIcon} size={16} />,
                warning: <HugeiconsIcon icon={AlertCircleIcon} size={16} />,
                error: <HugeiconsIcon icon={RemoveCircleIcon} size={16} />,
                loading: <HugeiconsIcon className="animate-spin" icon={ArrowReloadHorizontalIcon} size={16} />,
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'var(--radius)',
                } as React.CSSProperties
            }
            theme={theme as ToasterProps['theme']}
            toastOptions={{
                classNames: {
                    toast: 'font-mono !py-4 !px-6 !gap-4',
                    title: '!text-sm !font-medium',
                    description: '!text-sm !opacity-80',
                },
            }}
            {...props}
        />
    );
};

export { Toaster };

'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import AlertCircleIcon from '@merchbaseco/icons/core-solid-rounded/AlertCircleIcon';
import ArrowReloadHorizontalIcon from '@merchbaseco/icons/core-solid-rounded/ArrowReloadHorizontalIcon';
import CheckmarkCircle04Icon from '@merchbaseco/icons/core-solid-rounded/CheckmarkCircle04Icon';
import InformationCircleIcon from '@merchbaseco/icons/core-solid-rounded/InformationCircleIcon';
import RemoveCircleIcon from '@merchbaseco/icons/core-solid-rounded/RemoveCircleIcon';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            icons={{
                success: <HugeiconsIcon icon={CheckmarkCircle04Icon} size={16} />,
                info: <HugeiconsIcon icon={InformationCircleIcon} size={16} />,
                warning: <HugeiconsIcon icon={AlertCircleIcon} size={16} />,
                error: <HugeiconsIcon icon={RemoveCircleIcon} size={16} />,
                loading: <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} className="animate-spin" />,
            }}
            toastOptions={{
                classNames: {
                    toast: 'font-mono !py-4 !px-6 !gap-4',
                    title: '!text-sm !font-medium',
                    description: '!text-sm !opacity-80',
                },
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'var(--radius)',
                } as React.CSSProperties
            }
            {...props}
        />
    );
};

export { Toaster };

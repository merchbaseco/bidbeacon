import type { RefObject } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ChartHoverIndicatorProps {
    active?: boolean;
    coordinate?: { x: number; y: number };
    label?: string;
    containerRef: RefObject<HTMLDivElement>;
}

type HoverPosition = {
    x: number;
    top: number;
    bottom: number;
    y: number;
};

export const ChartHoverIndicator = ({ active, coordinate, label, containerRef }: ChartHoverIndicatorProps) => {
    const [mounted, setMounted] = useState(false);
    const [position, setPosition] = useState<HoverPosition | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useLayoutEffect(() => {
        if (!active || !coordinate || !containerRef.current) {
            setPosition(null);
            return;
        }

        const wrapper = containerRef.current.querySelector('.recharts-wrapper') as HTMLElement | null;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        setPosition({
            x: rect.left + coordinate.x,
            top: rect.top,
            bottom: rect.bottom,
            y: rect.top + coordinate.y,
        });
    }, [active, coordinate, containerRef]);

    if (!mounted || !active || !position || !label) return null;

    const inset = 6;
    const lineTop = position.top + inset;
    const lineBottom = position.bottom - inset;
    const lineHeight = Math.max(0, lineBottom - lineTop);
    const bubbleOffset = 24;

    return createPortal(
        <>
            <div
                className="fixed pointer-events-none"
                style={{
                    left: position.x,
                    top: lineTop,
                    height: lineHeight,
                    width: 1,
                    zIndex: 30,
                }}
            >
                <div className="absolute inset-0 bg-muted-foreground/40" />
            </div>
            <div
                className="fixed pointer-events-none"
                style={{
                    left: position.x,
                    top: lineBottom - bubbleOffset,
                    transform: 'translateX(-50%)',
                    zIndex: 40,
                }}
            >
                <div className="rounded-full bg-primary-foreground text-primary text-xs font-medium px-2.5 py-1 shadow-sm">{label}</div>
            </div>
        </>,
        document.body
    );
};

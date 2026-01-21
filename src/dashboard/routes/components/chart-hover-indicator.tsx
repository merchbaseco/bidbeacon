import type { RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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

    const updatePosition = useCallback(() => {
        if (!active || !coordinate || !containerRef.current) {
            setPosition(null);
            return;
        }

        const wrapper = containerRef.current.querySelector('.recharts-wrapper') as HTMLElement | null;
        if (!wrapper) {
            setPosition(null);
            return;
        }

        const rect = wrapper.getBoundingClientRect();
        setPosition({
            x: rect.left + coordinate.x,
            top: rect.top,
            bottom: rect.bottom,
            y: rect.top + coordinate.y,
        });
    }, [active, coordinate, containerRef]);

    useLayoutEffect(() => {
        updatePosition();
    }, [updatePosition]);

    useEffect(() => {
        if (!active) return;
        let frame = 0;
        const handleUpdate = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                updatePosition();
            });
        };

        handleUpdate();
        const scrollOptions: AddEventListenerOptions = { passive: true, capture: true };
        window.addEventListener('scroll', handleUpdate, scrollOptions);
        window.addEventListener('resize', handleUpdate);

        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener('scroll', handleUpdate, { capture: true });
            window.removeEventListener('resize', handleUpdate);
        };
    }, [active, updatePosition]);

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

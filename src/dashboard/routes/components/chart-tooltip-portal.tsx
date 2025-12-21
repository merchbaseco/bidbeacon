import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ChartTooltipPortalProps {
    active?: boolean;
    coordinate?: { x: number; y: number };
    children: React.ReactNode;
}

/**
 * Portal wrapper for Recharts tooltips.
 * Renders the tooltip content in a portal to document.body,
 * positioned based on the chart coordinates.
 */
export const ChartTooltipPortal = ({ active, coordinate, children }: ChartTooltipPortalProps) => {
    const [mounted, setMounted] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const markerRef = useRef<HTMLSpanElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        setMounted(true);
    }, []);

    useLayoutEffect(() => {
        if (!active || !coordinate || !tooltipRef.current || !markerRef.current) return;

        // Find the recharts-wrapper by traversing up from our marker element
        let element: HTMLElement | null = markerRef.current;
        while (element && !element.classList.contains('recharts-wrapper')) {
            element = element.parentElement;
        }

        if (!element) return;

        const rect = element.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();

        // Calculate position - center horizontally on the coordinate, position above
        let x = rect.left + coordinate.x - tooltipRect.width / 2;
        let y = rect.top + coordinate.y - tooltipRect.height - 10;

        // Ensure tooltip stays within viewport
        const padding = 8;
        if (x < padding) x = padding;
        if (x + tooltipRect.width > window.innerWidth - padding) {
            x = window.innerWidth - tooltipRect.width - padding;
        }
        if (y < padding) {
            // If not enough space above, show below
            y = rect.top + coordinate.y + 10;
        }

        setPosition({ x, y });
    }, [active, coordinate]);

    if (!active) return null;

    return (
        <>
            {/* Invisible marker to find the recharts wrapper */}
            <span ref={markerRef} style={{ display: 'none' }} />
            {mounted &&
                createPortal(
                    <div
                        ref={tooltipRef}
                        className="fixed pointer-events-none"
                        style={{
                            left: position.x,
                            top: position.y,
                            zIndex: 9999,
                        }}
                    >
                        {children}
                    </div>,
                    document.body
                )}
        </>
    );
};


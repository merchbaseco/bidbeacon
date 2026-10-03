import { useEffect, useRef } from 'react';
import { createLighthouseScene } from './header-lighthouse-scene';

/**
 * Live WebGL lighthouse for the header. Spins the beam with real elapsed time, pauses
 * while the tab is hidden or the header is off screen, and holds one resting frame
 * when motion is reduced. Calls `onReady` after its first frame so the static raster
 * underneath can step aside; if WebGL is unavailable it never does, and the raster stays.
 */
export const HeaderLighthouseCanvas = ({ onReady }: { onReady: () => void }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const header = canvas?.parentElement;
        if (!(canvas && header)) {
            return;
        }

        let lighthouse: ReturnType<typeof createLighthouseScene>;
        try {
            lighthouse = createLighthouseScene(canvas);
        } catch (error) {
            console.warn('[HeaderLighthouse] WebGL unavailable; keeping the static lighthouse', error);
            return;
        }

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let angle = REST_ANGLE;
        let frame = 0;
        let lastTime: number | null = null;
        let isOnScreen = true;
        let hasRendered = false;

        const draw = () => {
            lighthouse.render(angle, !reducedMotion.matches);
            if (!hasRendered) {
                hasRendered = true;
                onReady();
            }
        };
        const tick = (time: number) => {
            if (lastTime !== null) {
                angle += ((time - lastTime) / 1000) * RADIANS_PER_SECOND;
            }
            lastTime = time;
            draw();
            frame = requestAnimationFrame(tick);
        };
        const sync = () => {
            const shouldRun = isOnScreen && !document.hidden && !reducedMotion.matches;
            if (shouldRun && frame === 0) {
                lastTime = null;
                frame = requestAnimationFrame(tick);
            } else if (!shouldRun && frame !== 0) {
                cancelAnimationFrame(frame);
                frame = 0;
            }
            if (reducedMotion.matches) {
                angle = REST_ANGLE;
                draw();
            }
        };
        const resize = () => {
            lighthouse.resize(header.clientWidth, window.devicePixelRatio);
            draw();
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(header);
        const intersectionObserver = new IntersectionObserver(([entry]) => {
            isOnScreen = entry?.isIntersecting ?? true;
            sync();
        });
        intersectionObserver.observe(canvas);
        document.addEventListener('visibilitychange', sync);
        reducedMotion.addEventListener('change', sync);
        resize();
        sync();

        return () => {
            cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            intersectionObserver.disconnect();
            document.removeEventListener('visibilitychange', sync);
            reducedMotion.removeEventListener('change', sync);
            lighthouse.dispose();
        };
    }, [onReady]);

    return <canvas className="header-lighthouse-canvas" ref={canvasRef} />;
};

/** One revolution every ten seconds. */
const RADIANS_PER_SECOND = (Math.PI * 2) / 10;
/** Resting angle for reduced motion: the beam reaching out to the upper left. */
const REST_ANGLE = (70 * Math.PI) / 180;

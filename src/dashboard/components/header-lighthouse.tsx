import { lazy, Suspense, useCallback, useState } from 'react';
import './header-lighthouse.css';

/**
 * The lighthouse that rises from the header's bottom hairline, its beam turning
 * around the lantern.
 *
 * Purely decorative: the brand's accessible name stays on the header wordmark. The
 * header must be `relative overflow-hidden`; it clips the canvas at the hairline and
 * wherever the beam leaves the bar. A pre-rendered raster of the tower shows until the
 * lazily loaded three.js scene draws its first frame, and stays if WebGL is unavailable.
 */
export const HeaderLighthouse = () => {
    const [isLive, setIsLive] = useState(false);
    const handleReady = useCallback(() => setIsLive(true), []);

    return (
        <div aria-hidden className="header-lighthouse hidden md:block">
            <img
                alt=""
                className="header-lighthouse-tower"
                data-hidden={isLive}
                height={68}
                src="/header-lighthouse.png"
                srcSet="/header-lighthouse.png 1x, /header-lighthouse@2x.png 2x, /header-lighthouse@3x.png 3x"
                width={440}
            />
            <Suspense fallback={null}>
                <HeaderLighthouseCanvas onReady={handleReady} />
            </Suspense>
        </div>
    );
};

const HeaderLighthouseCanvas = lazy(() => import('./header-lighthouse-canvas').then(module => ({ default: module.HeaderLighthouseCanvas })));

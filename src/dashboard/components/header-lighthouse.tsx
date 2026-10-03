import './header-lighthouse.css';

/**
 * The lighthouse that rises from the header's bottom hairline, its beam turning
 * around the lantern.
 *
 * Purely decorative: the brand's accessible name stays on the header wordmark. The
 * header must be `relative overflow-hidden`. Both layers are pre-rendered from the
 * same cel-shaded 3D scene and share one box: the tower is a still raster cropped at
 * the hairline, and the beam is a sprite strip of one revolution with the tower's
 * occlusion and the lantern flash baked in, so it simply paints over the tower.
 * Timing lives in the stylesheet.
 */
export const HeaderLighthouse = () => (
    <div aria-hidden className="header-lighthouse hidden md:block">
        <img
            alt=""
            className="header-lighthouse-tower"
            height={68}
            src="/header-lighthouse.png"
            srcSet="/header-lighthouse.png 1x, /header-lighthouse@2x.png 2x, /header-lighthouse@3x.png 3x"
            width={200}
        />
        <div className="header-lighthouse-beam" />
    </div>
);

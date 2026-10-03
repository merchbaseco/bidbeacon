import './header-lighthouse.css';

/**
 * The lighthouse that rises from the header's bottom hairline, with a sweeping beam.
 *
 * Purely decorative: the brand's accessible name stays on the header wordmark. The
 * header must be `relative overflow-hidden`; it clips the beam where it leaves the
 * bar. The mark is a pre-rendered cel-shaded raster cropped at the hairline, so its
 * bottom edge is the header's bottom edge. Beam tuning lives in the stylesheet.
 */
export const HeaderLighthouse = () => (
    <div aria-hidden className="header-lighthouse hidden md:block">
        <svg aria-hidden="true" className="header-lighthouse-beam" height="1" overflow="visible" width="1">
            <path d={wedge(BEAM_OUTER_DEGREES)} fill="#f59e0b" />
            <path d={wedge(BEAM_INNER_DEGREES)} fill="#fcd34d" />
        </svg>
        <img
            alt=""
            className="header-lighthouse-mark"
            height={63}
            src="/header-lighthouse.png"
            srcSet="/header-lighthouse.png 1x, /header-lighthouse@2x.png 2x, /header-lighthouse@3x.png 3x"
            width={84}
        />
    </div>
);

const BEAM_LENGTH = 900;
const BEAM_OUTER_DEGREES = 9;
const BEAM_INNER_DEGREES = 4;

/** A flat wedge pointing along +x from the lamp, `halfAngle` degrees either side. */
const wedge = (halfAngle: number) => {
    const radians = (halfAngle * Math.PI) / 180;
    const x = BEAM_LENGTH * Math.cos(radians);
    const y = BEAM_LENGTH * Math.sin(radians);
    return `M0 0L${x} ${-y}L${x} ${y}Z`;
};

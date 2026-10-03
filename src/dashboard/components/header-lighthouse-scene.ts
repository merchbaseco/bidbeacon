import {
    BackSide,
    BoxGeometry,
    type BufferGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    type Material,
    Mesh,
    MeshBasicMaterial,
    NoToneMapping,
    PerspectiveCamera,
    Scene,
    ShaderMaterial,
    SphereGeometry,
    SRGBColorSpace,
    Vector2,
    Vector3,
    WebGLRenderer,
} from 'three';
import { createLighthouseGlare } from './header-lighthouse-glare';

/** Tunables. The beam's axis tilt, its spread, and the camera flash as it crosses the lens. */
/** Axis tilt: down far enough that the beam's lower edge reaches the camera (24deg below the lamp). */
const BEAM_ELEVATION_DEGREES = -16;
/** Half-angles of the optic: a little taller than wide, like a real lighthouse lens. */
const BEAM_HALF_WIDTH_DEGREES = 6;
const BEAM_HALF_HEIGHT_DEGREES = 8.5;
/** Glare starts building this far outside the beam's edge. */
const FLASH_WIDTH_DEGREES = 9;
/** Peak whitening of the canvas, 0..1. */
const FLASH_PEAK = 0.4;

/**
 * The header lighthouse as a live three.js scene: cel-shaded tower with ink outlines,
 * and a real cone of light turning about the tower axis. The beam starts inside the
 * lantern, so the opaque glass, bars and dome occlude it honestly wherever it points.
 *
 * Framing matches the pre-rendered fallback raster: the camera sees a 1536px virtual
 * frame, and the canvas is a crop of it whose bottom edge is the cut through the
 * upper stripe and whose horizontal centre is the gallery deck.
 */
export const createLighthouseScene = (canvas: HTMLCanvasElement) => {
    const renderer = new WebGLRenderer({ alpha: true, antialias: true, canvas });
    renderer.toneMapping = NoToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x00_00_00, 0);

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.copy(CAMERA_POSITION);
    camera.lookAt(CAMERA_TARGET);
    camera.rotateZ(CAMERA_ROLL);

    const { lamp, lampY } = buildTower(scene);
    const beam = buildBeam();
    beam.position.set(0, lampY, 0);
    scene.add(beam);

    const lampPosition = new Vector3(0, lampY, 0);
    const glare = createLighthouseGlare(scene, lampPosition, FLASH_PEAK);
    const toCamera = CAMERA_POSITION.clone().sub(lampPosition).normalize();
    const cameraAzimuth = Math.atan2(CAMERA_POSITION.z, CAMERA_POSITION.x);
    const cameraElevation = Math.asin(toCamera.y);
    const lampPixel = new Vector2();
    const projected = new Vector3();
    const drawingBuffer = new Vector2();

    return {
        /** `angle` is radians from facing the viewer, increasing anticlockwise from above. */
        render: (angle: number, allowFlash = true) => {
            beam.rotation.y = -(cameraAzimuth + angle);
            // Where the camera sits inside the optic's elliptical cone: 0 on the axis, 1 at its edge.
            const across = wrapAngle(angle) / BEAM_HALF_WIDTH;
            const below = (cameraElevation - BEAM_ELEVATION) / BEAM_HALF_HEIGHT;
            const fromAxis = Math.hypot(across, below);
            const outsideDegrees = Math.max(0, fromAxis - 1) * Math.min(BEAM_HALF_WIDTH_DEGREES, BEAM_HALF_HEIGHT_DEGREES);
            const exposure = allowFlash ? Math.max(0, 1 - outsideDegrees / FLASH_WIDTH_DEGREES) ** 2 : 0;
            // The lens glows wider than the flash: the glass brightens as the beam swings round.
            const lensGlow = Math.max(0, 1 - outsideDegrees / (FLASH_WIDTH_DEGREES * 4)) ** 2;
            lamp.color.copy(LAMP_COLOR).lerp(LAMP_FLASH_COLOR, allowFlash ? lensGlow : 0);
            renderer.getDrawingBufferSize(drawingBuffer);
            projected.copy(lampPosition).project(camera);
            lampPixel.set(((projected.x + 1) / 2) * drawingBuffer.x, ((projected.y + 1) / 2) * drawingBuffer.y);
            glare.update(exposure, lampPixel, renderer.getPixelRatio());
            renderer.render(scene, camera);
        },
        resize: (widthCss: number, pixelRatio: number) => {
            renderer.setPixelRatio(Math.min(pixelRatio, 2));
            renderer.setSize(widthCss, HEADER_HEIGHT, false);
            const width = widthCss / CSS_PER_VIRTUAL_PX;
            const height = HEADER_HEIGHT / CSS_PER_VIRTUAL_PX;
            camera.setViewOffset(VIRTUAL_FRAME, VIRTUAL_FRAME, DECK_CENTER_X - width / 2, CUT_Y - height, width, height);
        },
        dispose: () => {
            scene.traverse(object => {
                if (object instanceof Mesh) {
                    object.geometry.dispose();
                    for (const material of [object.material].flat()) {
                        material.dispose();
                    }
                }
            });
            glare.dispose();
            renderer.dispose();
        },
    };
};

const HEADER_HEIGHT = 68;
const VIRTUAL_FRAME = 1536;
/** Measured from the scene: the deck centre and the upper-stripe cut in the virtual frame. */
const DECK_CENTER_X = 804.47;
const CUT_Y = 932.12;
/** Dome top 5px below the header's top, cut at the hairline. */
const CSS_PER_VIRTUAL_PX = 0.107_69;

const CAMERA_POSITION = new Vector3(-1.4, 1.0, 3.6);
const CAMERA_TARGET = new Vector3(-0.1, 2.5, 0);
const CAMERA_ROLL = 0.09;

const BEAM_ELEVATION = (BEAM_ELEVATION_DEGREES * Math.PI) / 180;
const BEAM_HALF_WIDTH = (BEAM_HALF_WIDTH_DEGREES * Math.PI) / 180;
const BEAM_HALF_HEIGHT = (BEAM_HALF_HEIGHT_DEGREES * Math.PI) / 180;
const BEAM_LENGTH = 9;

const INK = '#0a0a14';
const LAMP_COLOR = new Color('#fcd34d');
const LAMP_FLASH_COLOR = new Color('#fffbeb');
const WHITE = ['#ffffff', '#e9e9f0', '#b4b4c8'] as const;
const INDIGO = ['#818cf8', '#6366f1', '#4338ca'] as const;
const CAP = ['#6366f1', '#4f46e5', '#312e81'] as const;
const OUTLINE = 0.028;
const LIGHT_DIRECTION = new Vector3(-0.6, 0.45, 0.66).normalize();

type Tones = readonly [string, string, string];

const buildTower = (scene: Scene) => {
    const part = (geometry: BufferGeometry, tones: Tones, y: number, outline = OUTLINE) => {
        const mesh: Mesh<BufferGeometry, Material> = new Mesh(geometry, celMaterial(tones));
        mesh.position.y = y;
        scene.add(mesh);
        // Ink hull: the same shape grown by a constant world offset, back faces only.
        geometry.computeBoundingBox();
        const size = new Vector3();
        geometry.boundingBox?.getSize(size);
        const hull = new Mesh(geometry, new MeshBasicMaterial({ color: INK, side: BackSide }));
        hull.position.y = y;
        hull.scale.set((size.x + 2 * outline) / size.x, (size.y + 2 * outline) / size.y, (size.z + 2 * outline) / size.z);
        scene.add(hull);
        return mesh;
    };

    const base = 0.32;
    const towerHeight = 2.0;
    const radiusAt = (h: number) => 0.82 + (0.56 - 0.82) * ((h - base) / towerHeight);
    let y = base;
    for (const tones of [WHITE, INDIGO, WHITE, INDIGO, WHITE]) {
        part(new CylinderGeometry(radiusAt(y + 0.4), radiusAt(y), 0.4, 64), tones, y + 0.2);
        y += 0.4;
    }
    part(new CylinderGeometry(0.78, 0.66, 0.13, 64), WHITE, y + 0.06);
    y += 0.12;
    part(new CylinderGeometry(0.76, 0.76, 0.16, 64, 1, true), CAP, y + 0.08, OUTLINE * 0.7);

    const lanternHeight = 0.58;
    const lanternRadius = 0.46;
    const lampY = y + lanternHeight / 2;
    const lamp = new MeshBasicMaterial({ color: LAMP_COLOR.clone() });
    const glass = part(new CylinderGeometry(lanternRadius, lanternRadius, lanternHeight, 64), WHITE, lampY);
    glass.material = lamp;
    const cameraAzimuth = Math.atan2(CAMERA_POSITION.z, CAMERA_POSITION.x);
    for (let i = 0; i < 8; i++) {
        const a = cameraAzimuth + ((i + 0.5) / 8) * Math.PI * 2;
        const bar = new Mesh(new BoxGeometry(0.045, lanternHeight, 0.045), new MeshBasicMaterial({ color: INK }));
        bar.position.set(Math.cos(a) * (lanternRadius + 0.01), lampY, Math.sin(a) * (lanternRadius + 0.01));
        bar.rotation.y = -a;
        scene.add(bar);
    }
    y += lanternHeight;

    part(new CylinderGeometry(0.56, 0.56, 0.09, 64), CAP, y + 0.04);
    y += 0.09;
    part(new SphereGeometry(0.5, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), CAP, y);
    part(new SphereGeometry(0.08, 24, 16), CAP, y + 0.56, OUTLINE * 0.7);
    return { lamp, lampY };
};

/** An open cone (no end cap) along +x from the lamp, brightest down its core, fading with distance. */
const buildBeam = () => {
    const geometry = new ConeGeometry(Math.tan(BEAM_HALF_WIDTH) * BEAM_LENGTH, BEAM_LENGTH, 96, 1, true);
    geometry.translate(0, -BEAM_LENGTH / 2, 0);
    // Local x becomes vertical once the cone is laid on its side: stretch it to the taller half-angle.
    geometry.scale(Math.tan(BEAM_HALF_HEIGHT) / Math.tan(BEAM_HALF_WIDTH), 1, 1);
    const material = new ShaderMaterial({
        depthWrite: false,
        side: DoubleSide,
        transparent: true,
        uniforms: { color: { value: new Color('#fbbf24') }, length: { value: BEAM_LENGTH } },
        vertexShader: `
            varying float vDistance;
            varying float vFacing;
            void main() {
                vDistance = -position.y;
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-viewPosition.xyz)));
                gl_Position = projectionMatrix * viewPosition;
            }`,
        fragmentShader: `
            uniform vec3 color;
            uniform float length;
            varying float vDistance;
            varying float vFacing;
            void main() {
                float along = clamp(vDistance / length, 0.0, 1.0);
                float alpha = 0.5 * pow(vFacing, 1.6) * pow(1.0 - along, 1.8);
                gl_FragColor = vec4(color, alpha);
                #include <colorspace_fragment>
            }`,
    });
    const cone = new Mesh(geometry, material);
    cone.rotation.z = Math.PI / 2 + BEAM_ELEVATION;
    cone.renderOrder = 10;
    const pivot = new Group();
    pivot.add(cone);
    return pivot;
};

const celMaterial = ([highlight, lit, shade]: Tones) =>
    new ShaderMaterial({
        uniforms: {
            highlight: { value: new Color(highlight) },
            lit: { value: new Color(lit) },
            shade: { value: new Color(shade) },
            light: { value: LIGHT_DIRECTION },
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 highlight;
            uniform vec3 lit;
            uniform vec3 shade;
            uniform vec3 light;
            varying vec3 vNormal;
            void main() {
                float d = dot(normalize(vNormal), light);
                gl_FragColor = vec4(d > 0.62 ? highlight : (d > 0.05 ? lit : shade), 1.0);
                #include <colorspace_fragment>
            }`,
    });

/** Signed angle in (-pi, pi]. */
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

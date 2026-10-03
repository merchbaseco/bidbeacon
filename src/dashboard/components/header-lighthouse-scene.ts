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
/** Axis tilt. The camera sits 24.1deg below the lamp; -22 runs the core just over the lens. */
const BEAM_ELEVATION_DEGREES = -22;
/** Half-angles of the optic. */
const BEAM_HALF_WIDTH_DEGREES = 6;
const BEAM_HALF_HEIGHT_DEGREES = 6;
/** Angle between the beam's axis and the lens at which the flash falls to ~37% of its peak. */
const FLASH_WIDTH_DEGREES = 5;
/** Peak whitening of the canvas, 0..1. */
const FLASH_PEAK = 0.2;

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

    const { lamp, lensY } = buildTower(scene);
    const beam = buildBeam();
    beam.position.set(0, lensY, 0);
    scene.add(beam);

    const lampPosition = new Vector3(0, lensY, 0);
    const toCamera = CAMERA_POSITION.clone().sub(lampPosition).normalize();
    // The flash sits on the lit glass facing the camera, at lamp height: the middle of the window
    // band the viewer sees, rather than the hidden lamp centre or the rail-covered lower glass.
    const glassExit = new Vector3(toCamera.x, 0, toCamera.z).setLength(LANTERN_RADIUS).add(lampPosition);
    const glare = createLighthouseGlare(scene, glassExit, FLASH_PEAK);
    const cameraAzimuth = Math.atan2(CAMERA_POSITION.z, CAMERA_POSITION.x);
    const axis = new Vector3();
    const lampPixel = new Vector2();
    const projected = new Vector3();
    const drawingBuffer = new Vector2();

    return {
        /** `angle` is radians from facing the viewer, increasing anticlockwise from above. */
        render: (angle: number, allowFlash = true) => {
            beam.rotation.y = -(cameraAzimuth + angle);
            // Where the camera sits inside the optic's elliptical cone: 0 on the axis, 1 at its edge.
            // Angle between the beam's axis and the direction to the camera: the flash peaks when
            // the core, not the edge, crosses the lens.
            axis.set(Math.cos(BEAM_ELEVATION) * Math.cos(cameraAzimuth + angle), Math.sin(BEAM_ELEVATION), Math.cos(BEAM_ELEVATION) * Math.sin(cameraAzimuth + angle));
            const offAxisDegrees = (Math.acos(Math.min(1, axis.dot(toCamera))) * 180) / Math.PI;
            const exposure = allowFlash ? Math.exp(-((offAxisDegrees / FLASH_WIDTH_DEGREES) ** 2)) : 0;
            // The glass brightens over a wider swing than the flash.
            const lensGlow = Math.exp(-((offAxisDegrees / (FLASH_WIDTH_DEGREES * 3)) ** 2));
            lamp.color.copy(LAMP_COLOR).lerp(LAMP_FLASH_COLOR, allowFlash ? lensGlow : 0);
            renderer.getDrawingBufferSize(drawingBuffer);
            projected.copy(glassExit).project(camera);
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
const BEAM_LENGTH = 7;
const LANTERN_RADIUS = 0.46;

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
    const railHeight = 0.16;
    part(new CylinderGeometry(0.76, 0.76, railHeight, 64, 1, true), CAP, y + railHeight / 2, OUTLINE * 0.7);

    const lanternHeight = 0.58;
    const lanternRadius = LANTERN_RADIUS;
    const lampY = y + lanternHeight / 2;
    // The lens sits mid-way up the glass the rail leaves visible, so the light reads from the window.
    const lensY = y + railHeight + (lanternHeight - railHeight) / 2;
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
    return { lamp, lensY };
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
                float alpha = 0.45 * pow(vFacing, 1.6) * pow(1.0 - along, 2.6);
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

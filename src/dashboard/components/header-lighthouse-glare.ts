import { AdditiveBlending, CanvasTexture, Color, Mesh, NormalBlending, PlaneGeometry, type Scene, ShaderMaterial, Sprite, SpriteMaterial, SRGBColorSpace, Vector2, type Vector3 } from 'three';

/**
 * The camera's response to looking down the beam: a glow and two thin streaks on the
 * lamp, and a veil that lifts the whole canvas toward white, strongest around the lamp.
 * Everything is driven by one `exposure` value in 0..1 and is invisible at 0, so the cel
 * look is untouched at rest.
 */
export const createLighthouseGlare = (scene: Scene, lamp: Vector3, peak: number) => {
    const glowTexture = radialTexture();
    const streakTexture = streakTextureFor();
    const glow = glareSprite(glowTexture, lamp, 0);
    const streak = glareSprite(streakTexture, lamp, 0);
    const tilted = glareSprite(streakTexture, lamp, 0.42);
    const veilMaterial = new ShaderMaterial({
        blending: NormalBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        uniforms: {
            amount: { value: 0 },
            lamp: { value: new Vector2() },
            radius: { value: 1 },
        },
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
            uniform float amount;
            uniform vec2 lamp;
            uniform float radius;
            void main() {
                float d = distance(gl_FragCoord.xy, lamp) / radius;
                gl_FragColor = vec4(1.0, 0.98, 0.92, amount * (0.3 + 0.7 * exp(-d * d)));
            }`,
    });
    const veil = new Mesh(new PlaneGeometry(2, 2), veilMaterial);
    veil.frustumCulled = false;
    veil.renderOrder = 100;
    for (const object of [veil, glow, streak, tilted]) {
        scene.add(object);
    }

    return {
        /** `lampPixel` is the lamp in drawing-buffer pixels, origin bottom left. */
        update: (exposure: number, lampPixel: Vector2, pixelRatio: number) => {
            const visible = exposure > 0.001;
            for (const object of [veil, glow, streak, tilted]) {
                object.visible = visible;
            }
            if (!visible) {
                return;
            }
            veilMaterial.uniforms.amount.value = exposure * peak;
            veilMaterial.uniforms.lamp.value.copy(lampPixel);
            veilMaterial.uniforms.radius.value = 140 * pixelRatio;
            glow.material.opacity = exposure;
            glow.scale.setScalar(0.9 + 1.6 * exposure);
            streak.material.opacity = exposure * 0.8;
            streak.scale.set(1.5 + 7 * exposure, 0.07, 1);
            tilted.material.opacity = exposure * 0.45;
            tilted.scale.set(1 + 4 * exposure, 0.05, 1);
        },
        dispose: () => {
            glowTexture.dispose();
            streakTexture.dispose();
            veil.geometry.dispose();
            veilMaterial.dispose();
            for (const sprite of [glow, streak, tilted]) {
                sprite.material.dispose();
            }
        },
    };
};

const glareSprite = (texture: CanvasTexture, lamp: Vector3, rotation: number) => {
    const sprite = new Sprite(
        new SpriteMaterial({
            blending: AdditiveBlending,
            color: new Color('#fff4d6'),
            depthTest: false,
            depthWrite: false,
            map: texture,
            rotation,
            transparent: true,
        })
    );
    sprite.position.copy(lamp);
    sprite.renderOrder = 101;
    return sprite;
};

const radialTexture = () =>
    canvasTexture(64, 64, (context, size) => {
        const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
    });

const streakTextureFor = () =>
    canvasTexture(128, 8, context => {
        const gradient = context.createLinearGradient(0, 0, 128, 0);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 3, 128, 2);
    });

const canvasTexture = (width: number, height: number, paint: (context: CanvasRenderingContext2D, size: number) => void) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context) {
        paint(context, width);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
};

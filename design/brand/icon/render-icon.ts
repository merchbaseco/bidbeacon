// Renders the BidBeacon lighthouse icon: scene.html → 512 master → icon.png (128) + favicon.ico (16/32/48).
// Usage: bun run brand:icon [--out <dir>]
// Default writes icon.png + favicon.ico to src/dashboard/public and the master next to this file;
// --out sends all three to <dir> (use it to diff against the shipped files).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, '../../..');
// three comes from the repo's own dependency, not this folder's tooling.
const THREE_BUILD = path.dirname(createRequire(path.join(REPO, 'package.json')).resolve('three'));
const RENDER = 2048;
const MASTER = 512;
const TILE = '#16133a';
const ICO_SIZES = [16, 32, 48];

const main = async () => {
    const out = argValue('--out');
    const outDir = path.resolve(REPO, out ?? 'src/dashboard/public');
    mkdirSync(outDir, { recursive: true });
    const master = await composeMaster(await renderScene());
    writeFileSync(path.join(out ? outDir : HERE, 'icon-master-512.png'), master);
    const icon = await resize(master, 128);
    writeFileSync(path.join(outDir, 'icon.png'), icon);
    const ico = encodeIco(await Promise.all(ICO_SIZES.map(size => resize(master, size))));
    writeFileSync(path.join(outDir, 'favicon.ico'), ico);
    console.log(`wrote ${outDir}: icon.png ${icon.length} B, favicon.ico ${ico.length} B`);
    if (icon.length > 64 * 1024) {
        throw new Error('icon.png exceeds the 64 KiB MCP icon budget');
    }
};

const renderScene = async () => {
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    try {
        const page = await browser.newPage({ viewport: { width: RENDER, height: RENDER } });
        page.on('pageerror', error => console.error('[pageerror]', error.message));
        await page.route('http://local/**', route => {
            const file = new URL(route.request().url()).pathname.slice(1);
            const source = file === 'scene.html' ? path.join(HERE, file) : path.join(THREE_BUILD, file);
            return route.fulfill({ body: readFileSync(source), contentType: file.endsWith('.html') ? 'text/html' : 'text/javascript' });
        });
        await page.goto(`http://local/scene.html?size=${RENDER}`);
        await page.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true);
        return await page.locator('canvas').screenshot({ omitBackground: true });
    } finally {
        await browser.close();
    }
};

// Lanczos-downsample the 2048 render, lay it on the rounded tile, then clip to the tile shape.
const composeMaster = async (raw: Buffer) => {
    const art = await sharp(raw).resize(MASTER, MASTER, { kernel: 'lanczos3' }).png().toBuffer();
    const onTile = await sharp(tileSvg(TILE))
        .composite([{ input: art }])
        .png()
        .toBuffer();
    return sharp(onTile)
        .composite([{ input: tileSvg('#000'), blend: 'dest-in' }])
        .png()
        .toBuffer();
};

const tileSvg = (fill: string) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}"><rect width="${MASTER}" height="${MASTER}" rx="${MASTER * 0.22}" fill="${fill}"/></svg>`);

const resize = (master: Buffer, size: number) => sharp(master).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();

// ICO container with PNG-encoded entries (supported by every current browser).
const encodeIco = (pngs: Buffer[]) => {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(pngs.length, 4);
    let offset = 6 + 16 * pngs.length;
    const entries = pngs.map((png, i) => {
        const size = ICO_SIZES[i] ?? 0;
        const entry = Buffer.alloc(16);
        entry.writeUInt8(size, 0);
        entry.writeUInt8(size, 1);
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(png.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += png.length;
        return entry;
    });
    return Buffer.concat([header, ...entries, ...pngs]);
};

const argValue = (flag: string) => {
    const index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
};

await main();

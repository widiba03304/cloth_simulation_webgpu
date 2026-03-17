/**
 * Load a cubemap from 6 face images (px, nx, py, ny, pz, nz).
 * WebGPU face order: +X, -X, +Y, -Y, +Z, -Z.
 */

const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

/** Base URL for cubemaps (src/renderer/assets/samples/cubemaps). Single source for all cubemap assets. */
export const CUBEMAP_BASE_URL = '/assets/samples/cubemaps';

export interface CubemapResource {
  texture: GPUTexture;
  view: GPUTextureView;
}

/** Default cubemap: src/renderer/assets/samples/cubemaps/studio_1 (imported so it is bundled) */
import defaultPx from '../assets/samples/cubemaps/studio_1/px.png';
import defaultNx from '../assets/samples/cubemaps/studio_1/nx.png';
import defaultPy from '../assets/samples/cubemaps/studio_1/py.png';
import defaultNy from '../assets/samples/cubemaps/studio_1/ny.png';
import defaultPz from '../assets/samples/cubemaps/studio_1/pz.png';
import defaultNz from '../assets/samples/cubemaps/studio_1/nz.png';

// WebGPU cube order: +X, -X, +Y, -Y, +Z, -Z. +Y = ceiling (py), -Y = floor (ny).
const DEFAULT_CUBEMAP_URLS: [string, string, string, string, string, string] = [
  defaultPx,
  defaultNx,
  defaultPy,
  defaultNy,
  defaultPz,
  defaultNz,
];

/**
 * Load a cubemap from 6 image URLs (order: +X, -X, +Y, -Y, +Z, -Z) or from a base URL.
 */
export async function loadCubemap(
  device: GPUDevice,
  baseUrlOrUrls: string | [string, string, string, string, string, string],
  faceSize: number = 0
): Promise<CubemapResource | null> {
  const format: GPUTextureFormat = 'rgba8unorm';
  const urls: string[] =
    typeof baseUrlOrUrls === 'string'
      ? FACE_NAMES.map((name) => `${baseUrlOrUrls.replace(/\/?$/, '/')}${name}.png`)
      : baseUrlOrUrls;

  let bitmaps: ImageBitmap[];
  try {
    bitmaps = await Promise.all(
      urls.map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${url}`);
        return createImageBitmap(await res.blob());
      })
    );
  } catch (e) {
    console.warn('Cubemap load failed:', e);
    return null;
  }

  const w = faceSize > 0 ? faceSize : bitmaps[0]!.width;
  const h = faceSize > 0 ? faceSize : bitmaps[0]!.height;

  const texture = device.createTexture({
    size: [w, h, 6],
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  for (let i = 0; i < 6; i++) {
    const bm = bitmaps[i]!;
    device.queue.copyExternalImageToTexture(
      { source: bm },
      { texture, origin: [0, 0, i] },
      [bm.width, bm.height, 1]
    );
    bm.close();
  }

  const view = texture.createView({
    dimension: 'cube',
    baseArrayLayer: 0,
    arrayLayerCount: 6,
  });

  return { texture, view };
}

/** Load the default studio_1 cubemap (bundled). */
export function loadDefaultCubemap(device: GPUDevice): Promise<CubemapResource | null> {
  return loadCubemap(device, DEFAULT_CUBEMAP_URLS);
}

/** Create a solid-color fallback cubemap (gray) when real cubemap fails to load. */
export function createFallbackCubemap(device: GPUDevice): CubemapResource {
  return createSolidCubemap(device, 128, 128, 128);
}

/**
 * Create a white studio-style cubemap for IBL when using grid background.
 * Uses a subtle brightness gradient (bright top, slightly dimmer sides/bottom)
 * so that hemisphere lighting preserves object form while feeling like
 * uniform white light.
 */
export function createWhiteCubemap(device: GPUDevice): CubemapResource {
  const size = 64;
  const format: GPUTextureFormat = 'rgba8unorm';
  const texture = device.createTexture({
    size: [size, size, 6],
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  // For each face, compute per-pixel brightness based on the world-space
  // direction's Y component.  Brightness = lerp(bottomVal, topVal, (y+1)/2).
  // This simulates a bright overhead environment (like a white studio ceiling).
  const topBrightness = 220;   // ceiling – bright white (×1.4 in shader → 1.0)
  const midBrightness = 160;   // horizon – visible but bright
  const bottomBrightness = 90;  // floor – clearly dimmer for form definition

  // face index → axis mapping (WebGPU cube order: +X -X +Y -Y +Z -Z)
  // For each face we compute the world direction from the (u,v) of that face.
  const writeFace = (faceIndex: number) => {
    const pixels = new Uint8Array(size * size * 4);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        // Map pixel to [-1,1] range within the face
        const u = (col + 0.5) / size * 2 - 1;
        const v = (row + 0.5) / size * 2 - 1;

        // Compute the world-space Y component of the direction for this texel
        let worldY = 0;
        switch (faceIndex) {
          case 0: worldY = -v; break;  // +X face: y = -v
          case 1: worldY = -v; break;  // -X face: y = -v
          case 2: worldY = 1;  break;  // +Y face: looking down from top → y positive
          case 3: worldY = -1; break;  // -Y face: looking up from bottom → y negative
          case 4: worldY = -v; break;  // +Z face: y = -v
          case 5: worldY = -v; break;  // -Z face: y = -v
        }

        // Smoothly map worldY ∈ [-1, 1] to brightness
        const t = (worldY + 1) * 0.5; // 0 = bottom, 1 = top
        let brightness: number;
        if (t > 0.5) {
          // top half: midBrightness → topBrightness
          const s = (t - 0.5) * 2;
          brightness = midBrightness + (topBrightness - midBrightness) * s;
        } else {
          // bottom half: bottomBrightness → midBrightness
          const s = t * 2;
          brightness = bottomBrightness + (midBrightness - bottomBrightness) * s;
        }
        const b = Math.round(brightness);
        const idx = (row * size + col) * 4;
        pixels[idx + 0] = b;
        pixels[idx + 1] = b;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
    }
    device.queue.writeTexture(
      { texture, origin: [0, 0, faceIndex] },
      pixels,
      { bytesPerRow: size * 4, rowsPerImage: size },
      [size, size, 1],
    );
  };

  for (let face = 0; face < 6; face++) {
    writeFace(face);
  }

  const view = texture.createView({
    dimension: 'cube',
    baseArrayLayer: 0,
    arrayLayerCount: 6,
  });

  return { texture, view };
}

function createSolidCubemap(
  device: GPUDevice,
  r: number,
  g: number,
  b: number
): CubemapResource {
  const size = 16;
  const format: GPUTextureFormat = 'rgba8unorm';
  const texture = device.createTexture({
    size: [size, size, 6],
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }

  for (let face = 0; face < 6; face++) {
    device.queue.writeTexture(
      { texture, origin: [0, 0, face] },
      pixels,
      { bytesPerRow: size * 4, rowsPerImage: size },
      [size, size, 1]
    );
  }

  const view = texture.createView({
    dimension: 'cube',
    baseArrayLayer: 0,
    arrayLayerCount: 6,
  });

  return { texture, view };
}

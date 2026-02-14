/**
 * Load a cubemap from 6 face images (px, nx, py, ny, pz, nz).
 * WebGPU face order: +X, -X, +Y, -Y, +Z, -Z.
 */

const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

export interface CubemapResource {
  texture: GPUTexture;
  view: GPUTextureView;
}

/** Default cubemap: assets/samples/cubemaps/studio_1 (imported so it is bundled) */
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
  const size = 16;
  const format: GPUTextureFormat = 'rgba8unorm';
  const texture = device.createTexture({
    size: [size, size, 6],
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  // Fill with mid-gray color (0.5, 0.5, 0.5, 1.0)
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = 128; // R
    pixels[i * 4 + 1] = 128; // G
    pixels[i * 4 + 2] = 128; // B
    pixels[i * 4 + 3] = 255; // A
  }

  // Upload to all 6 faces
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

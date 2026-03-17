/**
 * Cloth simulation lifecycle manager.
 * Centralizes GPU cloth creation so main.ts only handles loading-overlay bookkeeping.
 */
import { createCloth3D, type Cloth3DInstance } from '../sim/cloth3d/cloth3d';
import { getClothConfig } from '../data/patterns';
import { getClothMaterialParams } from '../data/materials';
import type { MaskPatternLayer } from '../sim/cloth3d/cloth3d.mask';
import type { BodyMesh } from '../render/bodyMesh';

export interface ClothBuildOptions {
  patternId: string;
  size: string;
  materialId: string;
  albedoOverride?: [number, number, number] | null;
  activePatternGrid?: { rows: number; cols: number; spacing: number; pinned?: string } | null;
  activePatternLayer?: MaskPatternLayer | null;
  bodyMesh?: BodyMesh;
  substeps?: number;
  iters?: number;
}

/** Destroy old cloth instance (if any) and create a fresh one. */
export async function buildCloth(
  device: GPUDevice,
  old: Cloth3DInstance | null,
  opts: ClothBuildOptions,
): Promise<Cloth3DInstance> {
  old?.destroy();
  const config = getClothConfig(opts.patternId, opts.size, opts.activePatternGrid, opts.activePatternLayer);
  const material = getClothMaterialParams(opts.materialId, opts.albedoOverride);
  const instance = await createCloth3D(device, config, material, opts.bodyMesh);
  instance.setQuality(opts.substeps ?? 8, opts.iters ?? 8);
  return instance;
}

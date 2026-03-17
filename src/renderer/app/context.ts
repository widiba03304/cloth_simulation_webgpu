/**
 * AppContext: mutable singleton holding GPU resources and sim references.
 * Non-reactive (GPU handles are not pub/sub — too frequent to diff).
 */
import type { GPUContext } from '../webgpu/device';
import type { RenderContext } from '../render/pipeline';
import type { Cloth3DInstance } from '../sim/cloth3d/cloth3d';
import type { OrbitCamera } from '../render/camera';

export interface AppContext {
  gpu: GPUContext | null;
  render: RenderContext | null;
  cloth3d: Cloth3DInstance | null;
  camera: OrbitCamera | null;
}

export const ctx: AppContext = {
  gpu: null,
  render: null,
  cloth3d: null,
  camera: null,
};

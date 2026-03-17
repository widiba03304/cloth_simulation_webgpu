/**
 * Resolve a scene to concrete asset refs for the editor (avatar index, pattern id, material id).
 */

import type { Scene } from './types';

export interface ResolvedScene {
  avatarIndex: number;
  patternId: string | undefined;
  materialId: string | undefined;
}

const DEFAULT_AVATAR_INDEX = 0;

/**
 * Returns avatar index (0/1 for bundled bodies), patternId, materialId for the given scene.
 * Supports both legacy avatarIndex and future avatarId (string → index mapping can be extended).
 */
export function resolveSceneForEditor(scene: Scene): ResolvedScene {
  let avatarIndex = scene.avatarIndex ?? DEFAULT_AVATAR_INDEX;
  if (scene.avatarId !== undefined) {
    const parsed = parseInt(scene.avatarId, 10);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) avatarIndex = parsed;
  }
  return {
    avatarIndex,
    patternId: scene.patternId,
    materialId: scene.materialId,
  };
}

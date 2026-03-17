/**
 * Scene = composition of asset references (avatar + pattern + material) plus optional view state.
 * Project in the dashboard is the same concept; Scene is the canonical type name.
 */

/** Scene: which assets to load and optional view state. */
export interface Scene {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
  thumbnail?: string;
  /** Avatar: index 0/1 for bundled SMPL, or id when using asset list by id. */
  avatarIndex?: number;
  /** Avatar asset id (when using id-based resolution). */
  avatarId?: string;
  /** Pattern asset id. */
  patternId?: string;
  /** Material asset id. */
  materialId?: string;
}

/**
 * Asset types: Avatar, Pattern, Material.
 * Common metadata for all assets; type-specific data lives in editors / loaders.
 */

export interface AssetMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

/** Avatar asset: body/mannequin (SMPL, OBJ). */
export type AvatarAsset = AssetMeta & {
  /** Index into bundled avatars (0 = male, 1 = female) or path when stored by user. */
  avatarIndex?: number;
};

/** Pattern asset: 2D pattern data for garment. */
export type PatternAsset = AssetMeta;

/** Material asset: fabric properties and appearance. */
export type MaterialAsset = AssetMeta;

export type AssetType = 'avatar' | 'pattern' | 'material';

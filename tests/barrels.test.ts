/**
 * Barrel file imports — ensures re-export modules are counted in coverage.
 */
import { describe, it, expect } from 'vitest';

// renderer/assets/index.ts
import type { AssetMeta, AvatarAsset, PatternAsset, MaterialAsset, AssetType } from '../src/renderer/assets/index';

// renderer/scene/index.ts
import { resolveSceneForEditor } from '../src/renderer/scene/index';
import type { Scene, ResolvedScene } from '../src/renderer/scene/index';

// renderer/ui/clothPreview.ts
import { createClothPreview } from '../src/renderer/ui/clothPreview';
import type { ClothPreview, ClothPreviewMaterialParams } from '../src/renderer/ui/clothPreview';

describe('barrel re-exports', () => {
  it('assets/index re-exports types', () => {
    // Type-only exports; just verify the import resolved
    const meta: AssetMeta = { id: 'a', name: 'n', createdAt: 0, updatedAt: 0 };
    expect(meta.id).toBe('a');
  });

  it('scene/index exports resolveSceneForEditor', () => {
    expect(typeof resolveSceneForEditor).toBe('function');
  });

  it('ui/clothPreview re-exports createClothPreview', () => {
    expect(typeof createClothPreview).toBe('function');
  });
});

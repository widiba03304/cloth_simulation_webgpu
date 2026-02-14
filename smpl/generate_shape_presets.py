"""
Generate SMPL shape preset meshes with different beta parameters.
Exports multiple body shapes as OBJ files.

Requires: numpy, scipy (chumpy uses scipy internally)
Install: pip install numpy scipy chumpy
"""

import numpy as np
import sys
import os

# Try to import SMPL
try:
    sys.path.insert(0, os.path.dirname(__file__))
    from smpl_webuser.serialization import load_model
except ImportError as e:
    print(f"Error: {e}")
    print("Make sure smpl_webuser is in the current directory")
    sys.exit(1)

def save_obj(filename, vertices, faces):
    """Save mesh as OBJ file."""
    with open(filename, 'w') as f:
        # Write vertices
        for v in vertices:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        # Write faces (OBJ is 1-indexed)
        for face in faces:
            f.write(f"f {face[0]+1} {face[1]+1} {face[2]+1}\n")

def generate_shape_presets(model_path, gender, output_dir):
    """Generate shape preset meshes with different beta parameters."""

    print(f"Loading SMPL {gender} model...")
    m = load_model(model_path)

    # Define shape presets (10 beta parameters each)
    # Beta 0-1: body weight (thin <-> heavy)
    # Beta 2-3: body height (short <-> tall)
    # Beta 4-9: other shape variations
    presets = {
        'thin': np.array([-2.0, -1.5, 0, 0, 0, 0, 0, 0, 0, 0]),
        'normal': np.zeros(10),
        'muscular': np.array([1.0, 2.0, 0.5, 0, 0, 0, 0, 0, 0, 0]),
        'heavy': np.array([2.5, 2.0, 0, 0, 0, 0, 0, 0, 0, 0]),
        'tall': np.array([0, 0, 2.0, 1.5, 0, 0, 0, 0, 0, 0]),
        'short': np.array([0, 0, -2.0, -1.5, 0, 0, 0, 0, 0, 0]),
    }

    os.makedirs(output_dir, exist_ok=True)

    for name, betas in presets.items():
        print(f"  Generating {name} preset...")

        # Set neutral pose (all zeros)
        m.pose[:] = 0
        m.betas[:] = betas

        # Get mesh vertices and faces
        vertices = np.array(m.r)  # Result after applying betas
        faces = np.array(m.f)

        # Save as OBJ
        output_file = os.path.join(output_dir, f'mannequin_{gender}_{name}.obj')
        save_obj(output_file, vertices, faces)
        print(f"    Saved: {output_file}")

    print(f"✓ Generated {len(presets)} shape presets for {gender}")

if __name__ == '__main__':
    output_dir = '../src/renderer/assets/samples/avatars'

    try:
        # Generate male presets
        print("=" * 60)
        print("Generating SMPL male shape presets...")
        print("=" * 60)
        generate_shape_presets(
            'models/basicmodel_m_lbs_10_207_0_v1.0.0.pkl',
            'male',
            output_dir
        )

        print("\n" + "=" * 60)
        print("Generating SMPL female shape presets...")
        print("=" * 60)
        # Generate female presets
        generate_shape_presets(
            'models/basicModel_f_lbs_10_207_0_v1.0.0.pkl',
            'female',
            output_dir
        )

        print("\n" + "=" * 60)
        print("✓ All shape presets generated successfully!")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Update UI to show shape preset dropdown")
        print("2. Load corresponding OBJ file when shape changes")

    except Exception as e:
        print(f"\nError: {e}")
        print("\nMake sure you have installed required packages:")
        print("  pip install numpy scipy chumpy")
        sys.exit(1)

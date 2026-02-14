"""
Extract SMPL data directly from pickle without using chumpy's deprecated APIs.
Works around inspect.getargspec compatibility issues.
"""

import pickle
import json
import sys
import os
import numpy as np

# Monkey-patch inspect for old chumpy compatibility
import inspect
if not hasattr(inspect, 'getargspec'):
    inspect.getargspec = inspect.getfullargspec

def extract_array(obj):
    """Extract numpy array from chumpy or numpy object."""
    # Try various ways to get the underlying array
    if isinstance(obj, np.ndarray):
        return obj
    elif hasattr(obj, 'r'):  # chumpy ch.array has .r attribute
        return np.array(obj.r)
    elif hasattr(obj, '__array__'):
        return np.array(obj)
    else:
        return np.array(obj)

def load_smpl_pickle(pkl_path):
    """Load SMPL pickle file and extract arrays."""
    print(f"Loading {pkl_path}...")

    with open(pkl_path, 'rb') as f:
        # Load with latin1 for Python 2->3 compatibility
        data = pickle.load(f, encoding='latin1')

    print(f"Keys in pickle: {list(data.keys())}")

    # Extract the arrays we need
    v_template = extract_array(data['v_template'])
    shapedirs = extract_array(data['shapedirs'])
    faces = extract_array(data['f'])

    print(f"  v_template: {v_template.shape} {v_template.dtype}")
    print(f"  shapedirs: {shapedirs.shape} {shapedirs.dtype}")
    print(f"  faces: {faces.shape} {faces.dtype}")

    return v_template, shapedirs, faces

def export_to_json(v_template, shapedirs, faces, output_path):
    """Export SMPL data to JSON."""
    print(f"Exporting to {output_path}...")

    # Ensure correct shapes
    assert v_template.shape == (6890, 3), f"Unexpected v_template shape: {v_template.shape}"
    assert shapedirs.shape == (6890, 3, 10), f"Unexpected shapedirs shape: {shapedirs.shape}"

    data = {
        'num_vertices': int(v_template.shape[0]),
        'num_faces': int(faces.shape[0]),
        'num_betas': int(shapedirs.shape[2]),
        'v_template': v_template.flatten().tolist(),
        'faces': faces.astype(int).flatten().tolist(),
        # For each beta, flatten the (6890, 3) displacement
        'shapedirs': [shapedirs[:, :, i].flatten().tolist() for i in range(shapedirs.shape[2])]
    }

    with open(output_path, 'w') as f:
        json.dump(data, f)

    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"✓ Saved successfully! ({file_size_mb:.2f} MB)")
    print(f"  Vertices: {data['num_vertices']}")
    print(f"  Faces: {data['num_faces']}")
    print(f"  Betas: {data['num_betas']}")

if __name__ == '__main__':
    output_dir = '../src/renderer/assets/samples/avatars'
    os.makedirs(output_dir, exist_ok=True)

    male_pkl = 'models/basicmodel_m_lbs_10_207_0_v1.0.0.pkl'
    female_pkl = 'models/basicModel_f_lbs_10_207_0_v1.0.0.pkl'

    if not os.path.exists(male_pkl) and not os.path.exists(female_pkl):
        print("Error: SMPL model files not found!")
        print(f"  Expected: {male_pkl} or {female_pkl}")
        sys.exit(1)

    try:
        # Male model
        if os.path.exists(male_pkl):
            print("=" * 60)
            print("SMPL Male Model")
            print("=" * 60)
            v_template, shapedirs, faces = load_smpl_pickle(male_pkl)
            male_json = os.path.join(output_dir, 'smpl_male_shapedirs.json')
            export_to_json(v_template, shapedirs, faces, male_json)
            print()

        # Female model
        if os.path.exists(female_pkl):
            print("=" * 60)
            print("SMPL Female Model")
            print("=" * 60)
            v_template, shapedirs, faces = load_smpl_pickle(female_pkl)
            female_json = os.path.join(output_dir, 'smpl_female_shapedirs.json')
            export_to_json(v_template, shapedirs, faces, female_json)
            print()

        print("=" * 60)
        print("✓ All SMPL data extracted!")
        print("=" * 60)
        print("\nNext: Implement real SMPL blend shape formula in TypeScript:")
        print("  v = v_template + Σ(beta_i × shapedirs[:,:,i])")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

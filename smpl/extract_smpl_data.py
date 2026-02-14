"""
Extract SMPL shape blend shapes (shapedirs) from pickle files using Python 3.
Works without scipy/chumpy by directly unpickling the data.
"""

import pickle
import json
import sys
import os
import numpy as np

def load_smpl_model(pkl_path):
    """Load SMPL model from pickle file (Python 3 compatible)."""
    with open(pkl_path, 'rb') as f:
        # Load with latin1 encoding for Python 2 -> 3 compatibility
        data = pickle.load(f, encoding='latin1')

    # Convert chumpy arrays to numpy if needed
    def to_numpy(obj):
        if hasattr(obj, 'r'):  # chumpy array
            return np.array(obj.r)
        elif hasattr(obj, '__array__'):
            return np.array(obj)
        else:
            return np.array(obj)

    v_template = to_numpy(data['v_template'])
    shapedirs = to_numpy(data['shapedirs'])
    faces = to_numpy(data['f'])

    return v_template, shapedirs, faces

def export_smpl_to_json(pkl_path, output_json):
    """Extract SMPL data and export to JSON."""
    print(f"Loading {pkl_path}...")

    v_template, shapedirs, faces = load_smpl_model(pkl_path)

    print(f"  v_template shape: {v_template.shape}")  # Should be (6890, 3)
    print(f"  shapedirs shape: {shapedirs.shape}")    # Should be (6890, 3, 10)
    print(f"  faces shape: {faces.shape}")            # Should be (13776, 3)

    # Prepare data for JSON export
    # shapedirs is (6890, 3, 10) - for each of 10 betas, we have a (6890, 3) displacement
    data = {
        'num_vertices': int(v_template.shape[0]),
        'num_faces': int(faces.shape[0]),
        'num_betas': int(shapedirs.shape[2]),
        'v_template': v_template.flatten().tolist(),
        'faces': faces.flatten().astype(int).tolist(),
        # Reshape shapedirs: for each beta i, flatten the (6890, 3) displacement
        'shapedirs': [shapedirs[:, :, i].flatten().tolist() for i in range(shapedirs.shape[2])]
    }

    # Save to JSON
    print(f"Writing to {output_json}...")
    with open(output_json, 'w') as f:
        json.dump(data, f)

    file_size_mb = os.path.getsize(output_json) / (1024 * 1024)
    print(f"✓ Exported successfully!")
    print(f"  Vertices: {data['num_vertices']}")
    print(f"  Faces: {data['num_faces']}")
    print(f"  Betas: {data['num_betas']}")
    print(f"  File size: {file_size_mb:.2f} MB")

if __name__ == '__main__':
    output_dir = '../src/renderer/assets/samples/avatars'
    os.makedirs(output_dir, exist_ok=True)

    # Check if model files exist
    male_pkl = 'models/basicmodel_m_lbs_10_207_0_v1.0.0.pkl'
    female_pkl = 'models/basicModel_f_lbs_10_207_0_v1.0.0.pkl'

    if not os.path.exists(male_pkl) and not os.path.exists(female_pkl):
        print("Error: SMPL model files not found!")
        print(f"  Expected: {male_pkl} or {female_pkl}")
        print("\nPlease download SMPL models from:")
        print("  https://smpl.is.tue.mpg.de/")
        sys.exit(1)

    try:
        # Export male model
        if os.path.exists(male_pkl):
            print("=" * 60)
            print("Extracting SMPL Male Model")
            print("=" * 60)
            male_json = os.path.join(output_dir, 'smpl_male_shapedirs.json')
            export_smpl_to_json(male_pkl, male_json)
            print()

        # Export female model
        if os.path.exists(female_pkl):
            print("=" * 60)
            print("Extracting SMPL Female Model")
            print("=" * 60)
            female_json = os.path.join(output_dir, 'smpl_female_shapedirs.json')
            export_smpl_to_json(female_pkl, female_json)
            print()

        print("=" * 60)
        print("✓ All SMPL data extracted successfully!")
        print("=" * 60)
        print("\nNext: Implement SMPL blend shape formula in TypeScript")
        print("  v = v_template + Σ(beta_i × shapedirs[:,:,i])")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        print("\nTry installing numpy:")
        print("  pip install numpy")
        sys.exit(1)

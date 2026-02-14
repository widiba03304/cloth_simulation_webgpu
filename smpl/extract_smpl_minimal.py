"""
Minimal SMPL data extractor that doesn't require chumpy to work properly.
Handles pickled data structures directly.
"""

import pickle
import json
import sys
import os
import numpy as np

# Block chumpy from being imported during pickle unpickling
sys.modules['chumpy'] = type(sys)('chumpy')

def unpickle_smpl(pkl_path):
    """Unpickle SMPL model without initializing chumpy objects."""

    class DummyClass:
        """Dummy class to stand in for unpicklable objects."""
        def __init__(self, *args, **kwargs):
            pass

    # Create dummy module attributes
    sys.modules['chumpy'].ch = type(sys)('ch')
    sys.modules['chumpy'].ch.Ch = DummyClass
    sys.modules['chumpy'].reordering = DummyClass
    sys.modules['chumpy.reordering'] = type(sys)('chumpy.reordering')
    sys.modules['chumpy.reordering'].cached_property = property

    # Custom unpickler that preserves numpy arrays
    class SMPLUnpickler(pickle.Unpickler):
        def find_class(self, module, name):
            # Let numpy classes through
            if module.startswith('numpy'):
                return super().find_class(module, name)
            # Replace chumpy classes with dummy
            if 'chumpy' in module:
                return DummyClass
            return super().find_class(module, name)

    with open(pkl_path, 'rb') as f:
        unpickler = SMPLUnpickler(f, encoding='latin1')
        data = unpickler.load()

    return data

def extract_numpy_array(obj):
    """Extract numpy array from any object."""
    if isinstance(obj, np.ndarray):
        return obj

    # Try common attributes (chumpy objects use 'x' or 'r')
    for attr in ['x', 'r', '_value', 'data', 'array']:
        if hasattr(obj, attr):
            val = getattr(obj, attr)
            if isinstance(val, np.ndarray):
                return val
            elif hasattr(val, '__array__'):
                return np.array(val)

    # Try converting directly
    try:
        return np.array(obj)
    except:
        # Last resort: check __dict__
        if hasattr(obj, '__dict__'):
            for key, val in obj.__dict__.items():
                if isinstance(val, np.ndarray):
                    return val
        raise ValueError(f"Could not extract array from {type(obj)}")

def load_and_export_smpl(pkl_path, output_json):
    """Load SMPL pickle and export to JSON."""
    print(f"Loading {pkl_path}...")

    data = unpickle_smpl(pkl_path)
    print(f"Loaded pickle with keys: {list(data.keys())}")

    # Extract arrays
    print("Extracting v_template...")
    v_template = extract_numpy_array(data['v_template'])
    print(f"  Shape: {v_template.shape}, dtype: {v_template.dtype}")

    print("Extracting shapedirs...")
    shapedirs = extract_numpy_array(data['shapedirs'])
    print(f"  Shape: {shapedirs.shape}, dtype: {shapedirs.dtype}")

    print("Extracting faces...")
    faces = extract_numpy_array(data['f'])
    print(f"  Shape: {faces.shape}, dtype: {faces.dtype}")

    # Validate shapes
    assert v_template.shape == (6890, 3), f"Unexpected v_template shape: {v_template.shape}"
    assert shapedirs.shape == (6890, 3, 10), f"Unexpected shapedirs shape: {shapedirs.shape}"

    # Prepare JSON data
    json_data = {
        'num_vertices': int(v_template.shape[0]),
        'num_faces': int(faces.shape[0]),
        'num_betas': int(shapedirs.shape[2]),
        'v_template': v_template.astype(float).flatten().tolist(),
        'faces': faces.astype(int).flatten().tolist(),
        'shapedirs': [shapedirs[:, :, i].astype(float).flatten().tolist()
                     for i in range(shapedirs.shape[2])]
    }

    # Export to JSON
    print(f"Writing to {output_json}...")
    with open(output_json, 'w') as f:
        json.dump(json_data, f)

    file_size_mb = os.path.getsize(output_json) / (1024 * 1024)
    print(f"✓ Export successful!")
    print(f"  Vertices: {json_data['num_vertices']}")
    print(f"  Faces: {json_data['num_faces']}")
    print(f"  Betas: {json_data['num_betas']}")
    print(f"  File size: {file_size_mb:.2f} MB")
    return True

if __name__ == '__main__':
    output_dir = '../src/renderer/assets/samples/avatars'
    os.makedirs(output_dir, exist_ok=True)

    male_pkl = 'models/basicmodel_m_lbs_10_207_0_v1.0.0.pkl'
    female_pkl = 'models/basicModel_f_lbs_10_207_0_v1.0.0.pkl'

    if not os.path.exists(male_pkl) and not os.path.exists(female_pkl):
        print("Error: SMPL model files not found!")
        sys.exit(1)

    success = True

    try:
        # Male model
        if os.path.exists(male_pkl):
            print("=" * 60)
            print("SMPL Male Model")
            print("=" * 60)
            male_json = os.path.join(output_dir, 'smpl_male_shapedirs.json')
            load_and_export_smpl(male_pkl, male_json)
            print()

        # Female model
        if os.path.exists(female_pkl):
            print("=" * 60)
            print("SMPL Female Model")
            print("=" * 60)
            female_json = os.path.join(output_dir, 'smpl_female_shapedirs.json')
            load_and_export_smpl(female_pkl, female_json)
            print()

        print("=" * 60)
        print("✓ SMPL data extraction complete!")
        print("=" * 60)
        print("\nReal SMPL blend shape formula:")
        print("  v = v_template + Σ(beta_i × shapedirs[:,:,i])")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

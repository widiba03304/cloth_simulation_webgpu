"""
Export SMPL skeletal data (joints, skinning weights, kinematic tree) to JSON.
This data is needed for inverse kinematics (IK) and pose manipulation.
Uses minimal unpickling approach to avoid chumpy dependency issues.
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
            if module.startswith('numpy') or module.startswith('scipy'):
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

def export_smpl_pose_data(pkl_path, output_json):
    """Extract skeletal data from SMPL model and save as JSON."""

    model = unpickle_smpl(pkl_path)

    # Get base template mesh for computing joint positions
    v_template = extract_numpy_array(model['v_template'])  # Shape: (6890, 3)
    print(f"  v_template shape: {v_template.shape}")

    # Get J_regressor: sparse matrix that computes joint positions from vertices
    # Shape: (24, 6890) - maps vertices to 24 joints
    J_regressor_sparse = model['J_regressor']
    # Convert sparse to dense
    if hasattr(J_regressor_sparse, 'todense'):
        J_regressor = np.array(J_regressor_sparse.todense())
    else:
        J_regressor = extract_numpy_array(J_regressor_sparse)
    print(f"  J_regressor shape: {J_regressor.shape}")

    # Compute rest pose joint positions
    # J = J_regressor @ v_template
    joint_positions = J_regressor @ v_template  # Shape: (24, 3)
    print(f"  joint_positions shape: {joint_positions.shape}")

    # Get kinematic tree structure (parent-child relationships)
    # Shape: (2, 24) where kintree_table[0] = parent IDs
    kintree_table = extract_numpy_array(model['kintree_table'])
    print(f"  kintree_table shape: {kintree_table.shape}")

    # Get skinning weights (how much each joint affects each vertex)
    # Shape: (6890, 24) - each vertex has 24 weights (one per joint)
    weights = extract_numpy_array(model['weights'])
    print(f"  weights shape: {weights.shape}")

    # Get pose blend shapes (optional - how pose affects mesh deformation)
    # Shape: (6890, 3, 207) where 207 = 69 × 3 (69 pose parameters)
    # This is optional for basic IK but useful for realistic deformation
    posedirs = None
    if 'posedirs' in model:
        try:
            posedirs = extract_numpy_array(model['posedirs'])
            print(f"  posedirs shape: {posedirs.shape}")
        except:
            print("  posedirs not available")

    # SMPL joint names (in order, indices 0-23)
    joint_names = [
        "pelvis",         # 0: Root joint
        "left_hip",       # 1
        "right_hip",      # 2
        "spine1",         # 3
        "left_knee",      # 4: IK target
        "right_knee",     # 5: IK target
        "spine2",         # 6
        "left_ankle",     # 7: IK target
        "right_ankle",    # 8: IK target
        "spine3",         # 9
        "left_foot",      # 10
        "right_foot",     # 11
        "neck",           # 12
        "left_collar",    # 13
        "right_collar",   # 14
        "head",           # 15
        "left_shoulder",  # 16
        "right_shoulder", # 17
        "left_elbow",     # 18: IK target
        "right_elbow",    # 19: IK target
        "left_wrist",     # 20: IK target
        "right_wrist",    # 21: IK target
        "left_hand",      # 22
        "right_hand",     # 23
    ]

    # Prepare data for export
    data = {
        'num_joints': int(joint_positions.shape[0]),  # 24
        'num_vertices': int(v_template.shape[0]),     # 6890

        # Template mesh vertices (6890 × 3) - used to recompute joints after shape changes
        'v_template': v_template.flatten().tolist(),

        # J_regressor matrix (24 × 6890) - computes joint positions from vertices
        # Flattened row-major
        'j_regressor': J_regressor.flatten().tolist(),

        # Joint rest positions (24 joints × 3 coordinates)
        'joint_positions': joint_positions.flatten().tolist(),

        # Kinematic tree: parent-child relationships
        # kintree_table[0] = parent joint IDs (-1 for root)
        # kintree_table[1] = joint IDs (0-23)
        'kintree_table': kintree_table.tolist(),

        # Skinning weights: how much each joint affects each vertex
        # Flattened (6890 × 24) row-major
        'weights': weights.flatten().tolist(),

        # Joint names for debugging
        'joint_names': joint_names,
    }

    # Optionally include pose blend shapes (large data)
    if posedirs is not None:
        print("  Including pose blend shapes (posedirs)...")
        # Shape: (6890, 3, 207) → flatten to (6890 × 3 × 207)
        data['posedirs'] = posedirs.flatten().tolist()
        data['num_pose_params'] = int(posedirs.shape[2])  # 207
    else:
        print("  No pose blend shapes found (posedirs)")

    # Save to JSON
    with open(output_json, 'w') as f:
        json.dump(data, f)

    print(f"Exported SMPL skeletal data to {output_json}")
    print(f"  - Joints: {data['num_joints']}")
    print(f"  - Vertices: {data['num_vertices']}")
    print(f"  - Skinning weights shape: ({data['num_vertices']}, {data['num_joints']})")
    print(f"  - File size: {os.path.getsize(output_json) / 1024 / 1024:.2f} MB")

    # Print kinematic tree structure for verification
    print("\n  Kinematic tree structure:")
    parent_ids = kintree_table[0]
    for i, name in enumerate(joint_names):
        parent = int(parent_ids[i])
        parent_name = joint_names[parent] if 0 <= parent < len(joint_names) else "ROOT"
        print(f"    [{i:2d}] {name:20s} → parent: {parent_name}")

if __name__ == '__main__':
    # Export male model
    male_pkl = 'models/basicmodel_m_lbs_10_207_0_v1.0.0.pkl'
    male_json = '../src/renderer/assets/samples/avatars/smpl_male_pose.json'

    # Export female model
    female_pkl = 'models/basicModel_f_lbs_10_207_0_v1.0.0.pkl'
    female_json = '../src/renderer/assets/samples/avatars/smpl_female_pose.json'

    print("Exporting SMPL male skeletal data...")
    export_smpl_pose_data(male_pkl, male_json)

    print("\n" + "="*60)
    print("Exporting SMPL female skeletal data...")
    export_smpl_pose_data(female_pkl, female_json)

    print("\n" + "="*60)
    print("✓ Done! Skeletal data exported.")
    print("\nIK-controllable joints (indices):")
    print("  - Wrists: 20 (left), 21 (right)")
    print("  - Ankles: 7 (left), 8 (right)")
    print("  - Elbows: 18 (left), 19 (right)")
    print("  - Knees: 4 (left), 5 (right)")

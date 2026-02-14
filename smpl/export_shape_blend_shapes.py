"""
Export SMPL shape blend shapes (shapedirs) to JSON for use in TypeScript/JavaScript.
Exports the first 10 principal shape components (betas) for body shape variation.
"""

import numpy as np
import pickle
import json
import sys
import os

def export_smpl_shapedirs(pkl_path, output_json):
    """Extract shape blend shapes from SMPL model and save as JSON."""

    with open(pkl_path, 'rb') as f:
        # Python 2/3 compatibility for pickle
        try:
            model = pickle.load(f, encoding='latin1')
        except:
            model = pickle.load(f)

    # Get base template mesh
    v_template = np.array(model['v_template'])  # Shape: (6890, 3)

    # Get shape blend shapes (shapedirs)
    # Shape: (6890, 3, 10) - 10 principal components
    shapedirs = np.array(model['shapedirs'])

    # Get faces
    faces = np.array(model['f'])  # Shape: (13776, 3)

    # Prepare data for export
    data = {
        'num_vertices': int(v_template.shape[0]),
        'num_faces': int(faces.shape[0]),
        'num_betas': int(shapedirs.shape[2]),  # Should be 10
        'v_template': v_template.flatten().tolist(),  # Flatten to [x,y,z,x,y,z,...]
        'faces': faces.flatten().tolist(),
        # Shapedirs: for each beta, store the delta for all vertices
        # Reshape from (6890, 3, 10) to (10, 6890*3) for easier access
        'shapedirs': [shapedirs[:, :, i].flatten().tolist() for i in range(shapedirs.shape[2])]
    }

    # Save to JSON
    with open(output_json, 'w') as f:
        json.dump(data, f)

    print(f"Exported SMPL shape blend shapes to {output_json}")
    print(f"  - Vertices: {data['num_vertices']}")
    print(f"  - Faces: {data['num_faces']}")
    print(f"  - Shape components (betas): {data['num_betas']}")
    print(f"  - File size: {os.path.getsize(output_json) / 1024 / 1024:.2f} MB")

if __name__ == '__main__':
    # Export male model
    male_pkl = 'models/basicmodel_m_lbs_10_207_0_v1.0.0.pkl'
    male_json = '../src/renderer/assets/samples/avatars/smpl_male_shapedirs.json'

    # Export female model
    female_pkl = 'models/basicModel_f_lbs_10_207_0_v1.0.0.pkl'
    female_json = '../src/renderer/assets/samples/avatars/smpl_female_shapedirs.json'

    print("Exporting SMPL male shape blend shapes...")
    export_smpl_shapedirs(male_pkl, male_json)

    print("\nExporting SMPL female shape blend shapes...")
    export_smpl_shapedirs(female_pkl, female_json)

    print("\n✓ Done! Shape blend shapes exported.")
    print("You can now use these in TypeScript to apply beta parameters.")

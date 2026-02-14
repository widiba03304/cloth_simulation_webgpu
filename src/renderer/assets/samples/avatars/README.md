# Avatar / mannequin meshes

Place **mannequin.obj** here to use an SMPL body as the mannequin.

## Generate from SMPL

1. Install Python deps for the SMPL webuser (see repo root `smpl/`).
2. From `smpl/smpl_webuser/hello_world/` run:
   ```bash
   python export_neutral_mannequin.py
   ```
   This writes a neutral-pose SMPL mesh to this folder as `mannequin.obj`.

If **mannequin.obj** is missing, the app uses a simple cylinder+sphere mannequin.

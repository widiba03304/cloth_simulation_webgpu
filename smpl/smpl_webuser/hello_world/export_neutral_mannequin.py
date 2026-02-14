"""
Export SMPL body in neutral pose (T-pose, zero shape) to OBJ for the cloth-sim mannequin.
Exports both male and female models.

Run from repo root (Python 3, no PYTHONPATH needed):
  cd /path/to/cloth_simulation_webgpu
  python smpl/smpl_webuser/hello_world/export_neutral_mannequin.py

Requires: smpl model .pkl files in smpl/models/
Output: src/renderer/assets/samples/avatars/mannequin_male.obj, mannequin_female.obj
"""

from __future__ import print_function
import numpy as np
import os
import pickle
import sys

_script_dir = os.path.dirname(os.path.abspath(__file__))
_smpl_root = os.path.normpath(os.path.join(_script_dir, '../..'))
_models_dir = os.path.join(_smpl_root, 'models')
out_dir = os.path.normpath(os.path.join(_smpl_root, '..', 'src', 'renderer', 'assets', 'samples', 'avatars'))
os.makedirs(out_dir, exist_ok=True)


def _make_chumpy_stub():
    """Build a class that mimics chumpy.ch.Ch for unpickling: accept (array,) or setstate(dict)."""
    class Ch(np.ndarray):
        def __new__(cls, *args, **kwargs):
            if args and hasattr(args[0], 'shape'):
                return np.asarray(args[0], dtype=np.float64).view(cls)
            if args and isinstance(args[0], (tuple, list)):
                return np.asarray(args[0], dtype=np.float64).view(cls)
            if args and isinstance(args[0], np.ndarray):
                return args[0].astype(np.float64).view(cls)
            return np.zeros((1, 3), dtype=np.float64).view(cls)

        def __setstate__(self, state):
            if isinstance(state, dict):
                for k in ('r', 'data', 'v', 'arr'):
                    if k in state:
                        arr = np.asarray(state[k], dtype=np.float64)
                        self.resize(arr.size, refcheck=False)
                        self.flat[:] = arr.flat
                        return
                if 'shape' in state:
                    self.resize(np.prod(state['shape']), refcheck=False)
                    if 'data' in state or 'flatten' in state:
                        pass
                return
            super(Ch, self).__setstate__(state)
    return Ch


def load_pkl(path):
    """Load SMPL .pkl without importing chumpy (use stub classes)."""
    _Ch = _make_chumpy_stub()

    class StubUnpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if module.startswith('chumpy'):
                return _Ch
            return super(StubUnpickler, self).find_class(module, name)

    with open(path, 'rb') as f:
        try:
            return StubUnpickler(f, encoding='latin1').load()
        except TypeError:
            return StubUnpickler(f).load()


def export_model(name, pkl_name):
    model_path = os.path.join(_models_dir, pkl_name)
    if not os.path.exists(model_path):
        print('Skip (not found):', model_path)
        return
    dd = load_pkl(model_path)
    v = np.asarray(dd['v_template'])
    f = np.asarray(dd['f'])
    out_path = os.path.join(out_dir, 'mannequin_{}.obj'.format(name))
    with open(out_path, 'w') as fp:
        for i in range(len(v)):
            fp.write('v %f %f %f\n' % (v[i, 0], v[i, 1], v[i, 2]))
        for i in range(len(f)):
            fp.write('f %d %d %d\n' % (f[i, 0] + 1, f[i, 1] + 1, f[i, 2] + 1))
    print('Written:', os.path.abspath(out_path))


# Try both common filename casings for male
for pkl_name in ('basicModel_m_lbs_10_207_0_v1.0.0.pkl', 'basicmodel_m_lbs_10_207_0_v1.0.0.pkl'):
    if os.path.exists(os.path.join(_models_dir, pkl_name)):
        export_model('male', pkl_name)
        break
else:
    print('No male .pkl found in', _models_dir)

export_model('female', 'basicModel_f_lbs_10_207_0_v1.0.0.pkl')

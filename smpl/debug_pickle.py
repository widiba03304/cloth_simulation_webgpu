"""Debug script to inspect SMPL pickle contents."""

import pickle
import sys
import numpy as np

sys.modules['chumpy'] = type(sys)('chumpy')

class DummyClass:
    def __init__(self, *args, **kwargs):
        self._args = args
        self._kwargs = kwargs

    def __repr__(self):
        return f"DummyClass(args={len(self._args)}, kwargs={list(self._kwargs.keys())})"

sys.modules['chumpy'].ch = type(sys)('ch')
sys.modules['chumpy'].ch.Ch = DummyClass
sys.modules['chumpy'].reordering = DummyClass
sys.modules['chumpy.reordering'] = type(sys)('chumpy.reordering')
sys.modules['chumpy.reordering'].cached_property = property

class SMPLUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if module.startswith('numpy'):
            return super().find_class(module, name)
        if 'chumpy' in module:
            return DummyClass
        return super().find_class(module, name)

pkl_path = 'models/basicmodel_m_lbs_10_207_0_v1.0.0.pkl'

with open(pkl_path, 'rb') as f:
    unpickler = SMPLUnpickler(f, encoding='latin1')
    data = unpickler.load()

print("Data keys:", list(data.keys()))
print()

for key in ['v_template', 'shapedirs', 'f']:
    obj = data[key]
    print(f"{key}:")
    print(f"  Type: {type(obj)}")
    print(f"  Is ndarray: {isinstance(obj, np.ndarray)}")

    if hasattr(obj, '__dict__'):
        print(f"  __dict__ keys: {list(obj.__dict__.keys())}")
        for attr_name, attr_val in list(obj.__dict__.items())[:5]:
            if isinstance(attr_val, np.ndarray):
                print(f"    {attr_name}: ndarray shape={attr_val.shape}")
            else:
                print(f"    {attr_name}: {type(attr_val)}")

    if hasattr(obj, 'r'):
        print(f"  Has .r attribute: {type(obj.r)}")
        if isinstance(obj.r, np.ndarray):
            print(f"    .r is ndarray with shape {obj.r.shape}")

    if hasattr(obj, '_args'):
        print(f"  Args count: {len(obj._args)}")
        for i, arg in enumerate(obj._args[:3]):
            if isinstance(arg, np.ndarray):
                print(f"    arg[{i}]: ndarray shape={arg.shape}")
            else:
                print(f"    arg[{i}]: {type(arg)}")

    print()

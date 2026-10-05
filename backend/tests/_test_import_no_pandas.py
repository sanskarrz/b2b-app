"""Standalone sanity-check: block pandas/numpy and import server + sync_engine."""
import sys


class _Blocker:
    def find_spec(self, name, path=None, target=None):
        root = name.split(".")[0]
        if root in {"pandas", "numpy"}:
            raise ImportError(f"BLOCKED: {name} not permitted at import time")
        return None


sys.meta_path.insert(0, _Blocker())
for mod in list(sys.modules):
    if mod.split(".")[0] in {"pandas", "numpy"}:
        del sys.modules[mod]

import importlib, pathlib  # noqa
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import server  # noqa: F401
import sync_engine  # noqa: F401
print("OK: server + sync_engine import without pandas/numpy")
print("Routes:", len(server.app.routes))

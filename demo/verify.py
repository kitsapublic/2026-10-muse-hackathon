"""Verify the retained demo files before setup or startup. This is integrity checking, not a signature."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def verify():
    manifest = json.loads((ROOT / 'artifact-manifest.json').read_text())
    for name, identity in manifest['files'].items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise SystemExit('Invalid artifact path')
        path = ROOT / relative
        if path.is_symlink() or not path.is_file() or ROOT not in path.resolve().parents:
            raise SystemExit(f'Missing or unsafe artifact: {name}')
        data = path.read_bytes()
        if len(data) != identity['bytes'] or hashlib.sha256(data).hexdigest() != identity['sha256']:
            raise SystemExit(f'Artifact changed: {name}')
    return manifest


if __name__ == '__main__':
    print('Verified demo', verify()['engine_version'])

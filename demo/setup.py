"""Install the demo offline into a new virtual environment. No model calls or credentials."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import venv

from verify import ROOT, verify

parser = argparse.ArgumentParser()
parser.add_argument('--venv', type=Path, default=ROOT / '.venv')
args = parser.parse_args()
manifest = verify()
if sys.version_info < (3, 11):
    raise SystemExit('Python 3.11 or newer is required')
if args.venv.exists():
    raise SystemExit('Choose a new --venv directory; existing environments are never overwritten')
venv.EnvBuilder(with_pip=True).create(args.venv)
python = args.venv.resolve() / 'bin/python'
environment = {k: v for k, v in os.environ.items() if not k.startswith('PIP_')}
environment['PIP_CONFIG_FILE'] = os.devnull
subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--no-index',
                '--find-links', str(ROOT / 'wheelhouse'), '--require-hashes', '-r', str(ROOT / 'service.lock')], check=True, env=environment)
subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--no-index', '--no-deps',
                str(ROOT / manifest['engine_wheel'])], check=True, env=environment)
print('Installed. Run:', str(python), str(ROOT / 'run.py'), '--store', 'NEW_STORE_PATH')

"""Serve the reference demo on loopback. It never enables model spending."""
import argparse
from pathlib import Path
import subprocess
import sys

from verify import ROOT, verify

parser = argparse.ArgumentParser()
parser.add_argument('--store', type=Path, required=True)
parser.add_argument('--port', type=int, default=8765)
args = parser.parse_args()
manifest = verify()
from eligibility_lab import __version__
if __version__ != manifest['engine_version']:
    raise SystemExit('Run with the Python environment created by setup.py')
service = [sys.executable, '-m', 'eligibility_lab.service.cli']
subprocess.run([*service, 'init', '--store', str(args.store)], check=True)
subprocess.run([*service, 'install-bundle', '--store', str(args.store), '--bundle', str(ROOT / 'reference'),
                '--audience', 'public'], check=True)
subprocess.run([*service, 'serve', '--store', str(args.store), '--port', str(args.port),
                '--assets', str(ROOT / 'showcase')], check=True)

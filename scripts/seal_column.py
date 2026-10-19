#!/usr/bin/env python3
"""Encrypt an already approved private JSON; never invent or grant approval."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
from column_release import JST, ReleaseError, require, validate

CRYPTO = Path(__file__).with_name('bundle_crypto.mjs')

def crypt(operation, slot, raw, env):
    result = subprocess.run(['node',str(CRYPTO),operation,slot],input=raw,capture_output=True,env={**os.environ,**env},timeout=30)
    require(result.returncode == 0, 'BUNDLE_CRYPTO_FAILED')
    return result.stdout

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--root',type=Path,default=Path.cwd())
    args=parser.parse_args()
    require(not args.input.resolve().is_relative_to(args.root.resolve()),'PRIVATE_INPUT_MUST_BE_OUTSIDE_REPOSITORY')
    require(args.input.stat().st_size <= 10*1024*1024,'PAYLOAD_TOO_LARGE')
    raw=args.input.read_bytes(); payload=json.loads(raw)
    validate(payload,payload['slot'],datetime.now(JST),args.root)
    sealed=crypt('encrypt',payload['slot'],raw,{})
    output=args.root/'scheduled'/(payload['slot']+'.enc.json')
    output.parent.mkdir(exist_ok=True)
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as stream: stream.write(sealed+b'\n')
    print('APPROVED_BUNDLE_ENCRYPTED; key and manuscript withheld')

if __name__=='__main__':
    try: main()
    except Exception:
        print('SEAL_FAILED: check private input, approval, references and key locally; content withheld',file=sys.stderr)
        sys.exit(1)

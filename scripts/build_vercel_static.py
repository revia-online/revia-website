#!/usr/bin/env python3
"""Build a Vercel-only public tree, preserving existing URLs and file bytes.

Do not reuse the Cloudflare Pages dist/ output: its booking endpoints are mocked.
The shared allowlist prevents scripts, test fixtures, GAS, docs and drafts
from entering Vercel's static output.
"""
from pathlib import Path
import hashlib
import json
import shutil

from build_pages import public_paths

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_NAME = 'vercel-public'


def build(root=ROOT, output=None):
    root = Path(root).resolve()
    output = Path(output) if output is not None else root / OUTPUT_NAME
    if output.is_symlink() or output.resolve() == root:
        raise RuntimeError('UNSAFE_VERCEL_OUTPUT')
    html_paths, static_paths = public_paths(root)
    selected = sorted(set(html_paths + static_paths))
    if len(selected) != len(html_paths) + len(static_paths):
        raise RuntimeError('DUPLICATE_VERCEL_PATHS')
    # public_paths verifies that every source is beneath the repository and
    # excludes non-public directories, dotfiles and future publication drafts.
    if output.exists():
        if not output.is_dir():
            raise RuntimeError('VERCEL_OUTPUT_NOT_DIRECTORY')
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for relative in selected:
        src = root / relative
        dst = output / relative
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        if hashlib.sha256(src.read_bytes()).digest() != hashlib.sha256(dst.read_bytes()).digest():
            raise RuntimeError('VERCEL_COPY_FAILED ' + relative)
    found = {p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file()}
    if found != set(selected):
        raise RuntimeError('VERCEL_UNEXPECTED_FILES')
    blocked = ('google-apps-script/', 'scripts/', 'tests/', 'docs/', 'config/',
               'tmp/', 'cloudflare/', '.github/', 'revia-site-vercel-drop-20260704/')
    if any(name.startswith(blocked) for name in found):
        raise RuntimeError('VERCEL_PRIVATE_PATH_EXPOSED')
    result = {'html_files': len(html_paths), 'static_files': len(static_paths),
              'output_files': len(found), 'output': str(output)}
    print('VERCEL_STATIC_OUTPUT_READY ' + json.dumps(result, ensure_ascii=False))
    return result


if __name__ == '__main__':
    build()

#!/usr/bin/env python3
"""Commit exactly the validated release paths; never print raw git error output."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime
from column_release import JST, due, require, ReleaseError, read_ledger


def git(*args):
    p = subprocess.run(["git", *args], capture_output=True, text=True)
    require(p.returncode == 0, "GIT_OPERATION_FAILED_CHECK_AUTH_OR_CONCURRENT_MAIN_CHANGE")
    return p.stdout.strip()


def main():
    require(os.environ.get("GITHUB_REF") == "refs/heads/main" and os.environ.get("REVIA_PUBLISH_202610_ENABLED") == "true", "ACTIVATION_REQUIRED")
    require(git("branch", "--show-current") == "main", "MAIN_REQUIRED")
    paths = json.loads((Path(os.environ["RUNNER_TEMP"]) / "revia-release-paths.json").read_text())
    require(paths and all(p in ("index.html", "column/index.html", "sitemap.xml", "publication/2026-10.json") or re.fullmatch(r"column/2026-10-[a-z0-9-]+\.html|images/column-2026-10-[a-z0-9-]+\.(jpg|jpeg|png|webp)", p) for p in paths), "UNEXPECTED_CHANGED_PATH")
    read_ledger(Path.cwd())
    require(git("diff", "--cached", "--name-only") == "", "INDEX_NOT_CLEAN")
    git("add", "--", *paths)
    require(set(git("diff", "--cached", "--name-only").splitlines()) <= set(paths), "UNEXPECTED_STAGED_PATH")
    name, email = os.environ.get("REVIA_RELEASE_AUTHOR_NAME"), os.environ.get("REVIA_RELEASE_AUTHOR_EMAIL")
    require(name and email, "RELEASE_AUTHOR_REQUIRED")
    git("-c", "user.name=" + name, "-c", "user.email=" + email,
        "commit", "-m", "Publish approved REVIA October 2026 column release")
    require(bool(due(datetime.now(JST))), "CAMPAIGN_CLOSED_BEFORE_PUSH")
    # A normal push rejects concurrent edits. Never force, reset remote, or merge.
    git("push", "origin", "HEAD:main")
    print("RELEASE_COMMIT_PUSHED " + git("rev-parse", "HEAD"))


if __name__ == "__main__":
    try:
        main()
    except ReleaseError as error:
        print("ERROR " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("ERROR COMMIT_FAILED (details withheld)", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""
Audit & migrate pinned GitHub Actions off deprecated Node runtimes.

GitHub is deprecating the node16/node20 action runtimes in favour of node24.
This repo pins third-party actions to full commit SHAs, so a deprecation means
finding every pin whose action.yml still declares `using: node16|node20` and
repinning it to the newest release that runs on node24.

What it does
------------
1. Scans `.github/` for `uses: owner/repo[/subdir]@<40-hex-sha>` pins
   (workflows and composite actions).
2. For each unique pin, reads `action.yml`/`action.yaml` *at that exact SHA*
   from raw.githubusercontent.com and extracts `runs.using`.
     - node24 / composite / docker  -> already fine, left untouched
     - node16 / node20              -> AFFECTED
     - pinned commit unreachable (404, i.e. a stale/force-moved tag) -> AFFECTED
3. For each affected action, lists tags with `git ls-remote` and finds the
   newest non-prerelease semver tag whose action.yml declares `using: node24`,
   then repins every occurrence to that tag's commit SHA and rewrites the
   trailing `# vX.Y.Z` comment.

Data sources are `git ls-remote` (read-only) and raw.githubusercontent.com.
Neither counts against the GitHub REST API rate limit, so no token is needed.

Usage
-----
    python3 bump-actions-to-node24.py                 # dry run (default), prints plan
    python3 bump-actions-to-node24.py --apply         # rewrite the workflow files
    python3 bump-actions-to-node24.py --report out.md # also write a markdown report
    python3 bump-actions-to-node24.py --root .github  # scan root (default: .github)
"""
from __future__ import annotations

import argparse
import dataclasses
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
from collections import defaultdict

RAW = "https://raw.githubusercontent.com"
USES_RE = re.compile(
    r"^(?P<prefix>\s*(?:-\s*)?uses:\s*)"
    r"(?P<repo>[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+?)"
    r"@(?P<sha>[0-9a-fA-F]{40})"
    r"(?P<rest>\s*(?:#.*)?)$"
)
USING_RE = re.compile(r"""^\s*using:\s*['"]?([A-Za-z0-9]+)['"]?""")
SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")  # strict X.Y.Z, no prerelease
DEPRECATED = {"node16", "node20", "node12", "node10"}

_using_cache: dict[tuple, str | None] = {}
_tags_cache: dict[str, dict[str, str]] = {}


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "node24-audit"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # network hiccup -> surface, do not silently misclassify
        print(f"  ! fetch error {url}: {e}", file=sys.stderr)
        return 0, ""


def split_repo(repo: str) -> tuple[str, str, str]:
    """owner/name[/sub...] -> (owner, name, subdir)."""
    parts = repo.split("/")
    return parts[0], parts[1], "/".join(parts[2:])


def runtime_at(repo: str, ref: str) -> str | None:
    """Return runs.using for action at ref, or None if no action file (404)."""
    key = (repo, ref)
    if key in _using_cache:
        return _using_cache[key]
    owner, name, sub = split_repo(repo)
    sub = f"{sub}/" if sub else ""
    result: str | None = None
    for fname in ("action.yml", "action.yaml"):
        status, body = fetch(f"{RAW}/{owner}/{name}/{ref}/{sub}{fname}")
        if status == 200:
            for line in body.splitlines():
                m = USING_RE.match(line)
                if m:
                    result = m.group(1).lower()
                    break
            else:
                result = "<no-using-key>"
            break
    _using_cache[key] = result
    return result


def tag_shas(repo: str) -> dict[str, str]:
    """tag -> commit SHA, preferring the peeled (^{}) commit for annotated tags."""
    if repo in _tags_cache:
        return _tags_cache[repo]
    out = subprocess.run(
        ["git", "ls-remote", "--tags", f"https://github.com/{repo}"],
        capture_output=True, text=True, timeout=60,
    ).stdout
    direct, peeled = {}, {}
    for line in out.splitlines():
        try:
            sha, ref = line.split("\t", 1)
        except ValueError:
            continue
        if not ref.startswith("refs/tags/"):
            continue
        tag = ref[len("refs/tags/"):]
        if tag.endswith("^{}"):
            peeled[tag[:-3]] = sha
        else:
            direct[tag] = sha
    result = {t: peeled.get(t, s) for t, s in direct.items()}
    _tags_cache[repo] = result
    return result


def latest_node24(repo: str) -> tuple[str, str] | None:
    """Newest non-prerelease semver tag whose action.yml is NOT node<24. -> (tag, sha)."""
    owner, name, _sub = split_repo(repo)
    tags = tag_shas(f"{owner}/{name}")  # tags live on the repo, not the subdir
    candidates = []
    for tag in tags:
        m = SEMVER_RE.match(tag)
        if m:
            candidates.append((tuple(int(x) for x in m.groups()), tag))
    for _, tag in sorted(candidates, reverse=True):
        using = runtime_at(repo, f"refs/tags/{tag}")
        if using and using not in DEPRECATED and using != "<no-using-key>":
            return tag, tags[tag]
    return None


@dataclasses.dataclass
class Pin:
    repo: str
    sha: str
    files: set = dataclasses.field(default_factory=set)
    count: int = 0


def scan(root: str) -> dict[tuple, Pin]:
    pins: dict[tuple, Pin] = {}
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if not fn.endswith((".yml", ".yaml")):
                continue
            path = os.path.join(dirpath, fn)
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    m = USES_RE.match(line.rstrip("\n"))
                    if not m:
                        continue
                    repo, sha = m.group("repo"), m.group("sha").lower()
                    # skip reusable-workflow refs (owner/repo/.github/workflows/x.yml@sha)
                    if repo.endswith((".yml", ".yaml")):
                        continue
                    key = (repo, sha)
                    p = pins.setdefault(key, Pin(repo, sha))
                    p.files.add(path)
                    p.count += 1
    return pins


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".github", help="directory to scan (default: .github)")
    ap.add_argument("--apply", action="store_true", help="rewrite files (default: dry run)")
    ap.add_argument("--report", help="write a markdown report to this path")
    args = ap.parse_args()

    if not os.path.isdir(args.root):
        print(f"error: {args.root} not found (run from repo root)", file=sys.stderr)
        return 2

    pins = scan(args.root)
    print(f"Scanned {args.root}: {len(pins)} unique SHA-pinned action refs\n")

    affected = []   # (Pin, current_using, target_tag, target_sha)
    ok = []         # (Pin, current_using)
    blocked = []    # (Pin, current_using)  -- no node24 release available

    for key in sorted(pins):
        pin = pins[key]
        using = runtime_at(pin.repo, pin.sha)
        is_stale = using is None
        if not is_stale and using not in DEPRECATED:
            ok.append((pin, using))
            continue
        target = latest_node24(pin.repo)
        cur = using if using else "stale/unreachable"
        if target is None:
            blocked.append((pin, cur))
            continue
        tag, sha = target
        if sha.lower() == pin.sha.lower():
            ok.append((pin, f"{cur} (already latest)"))
            continue
        affected.append((pin, cur, tag, sha))

    # ---- plan output ----
    print(f"AFFECTED (node<24 / stale) -> repin to latest node24: {len(affected)}")
    for pin, cur, tag, sha in affected:
        print(f"  {pin.repo:<46} {cur:<18} -> {tag:<10} {sha}  ({pin.count}x)")
    print(f"\nOK (node24 / composite / docker, untouched): {len(ok)}")
    for pin, using in ok:
        print(f"  {pin.repo}@{pin.sha[:12]}  {using} ({pin.count}x)")
    if blocked:
        print(f"\nBLOCKED (no node24 release exists yet -- manual review): {len(blocked)}")
        for pin, cur in blocked:
            print(f"  {pin.repo}@{pin.sha[:12]}  {cur} ({pin.count}x)")

    # ---- rewrite ----
    edits = 0
    if affected:
        remap = {}  # file -> list of (repo, oldsha, newsha, newtag)
        files = set()
        for pin, _cur, tag, sha in affected:
            for f in pin.files:
                remap.setdefault(f, []).append((pin.repo, pin.sha, sha, tag))
                files.add(f)
        for f in sorted(files):
            with open(f, encoding="utf-8") as fh:
                text = fh.read()
            new = text
            for repo, oldsha, newsha, tag in remap[f]:
                pat = re.compile(
                    r"(?P<prefix>(?:-[ \t]*)?uses:[ \t]*)" + re.escape(repo) +
                    r"@" + re.escape(oldsha) + r"(?:[ \t]*#[^\n]*)?",
                    re.IGNORECASE,
                )
                new, n = pat.subn(
                    lambda m: f"{m.group('prefix')}{repo}@{newsha} # {tag}", new
                )
                edits += n
            if new != text and args.apply:
                with open(f, "w", encoding="utf-8") as fh:
                    fh.write(new)
        print(f"\n{'APPLIED' if args.apply else 'DRY RUN'}: {edits} line(s) "
              f"across {len(files)} file(s)" + ("" if args.apply else " — re-run with --apply"))

    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            fh.write("# Pinned-action Node runtime audit (target: node24)\n\n")
            fh.write(f"Scanned `{args.root}` — {len(pins)} unique SHA-pinned refs.\n\n")
            fh.write("## Affected — repin to latest node24\n\n")
            fh.write("| Action | Current | → Target tag | Target SHA | Uses |\n")
            fh.write("|---|---|---|---|---|\n")
            for pin, cur, tag, sha in affected:
                fh.write(f"| `{pin.repo}` | {cur} | `{tag}` | `{sha}` | {pin.count} |\n")
            fh.write("\n## Already OK (untouched)\n\n")
            fh.write("| Action@sha | Runtime | Uses |\n|---|---|---|\n")
            for pin, using in ok:
                fh.write(f"| `{pin.repo}@{pin.sha[:12]}` | {using} | {pin.count} |\n")
            if blocked:
                fh.write("\n## Blocked — no node24 release yet\n\n")
                for pin, cur in blocked:
                    fh.write(f"- `{pin.repo}@{pin.sha[:12]}` ({cur}, {pin.count}x)\n")
        print(f"\nReport written to {args.report}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

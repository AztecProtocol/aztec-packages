#!/usr/bin/env python3
"""Fails unless a netlify.toml lets only deploy previews build.

aztec-docs-dev builds docs/ from this repository, and docs.aztec.network is a `netlify deploy
--no-build --prod` upload that reads neither key: only deploy previews may build. Production and
branch deploys skip (`ignore`), and fail (`command`) should `ignore` fail open. Netlify applies
branch-named contexts over [context.production], so no other context may exist.

  check_netlify_toml.py <netlify.toml>
  check_netlify_toml.py --self-test

Needs Python 3.11+ (tomllib); without it, a local run warns and passes and CI fails.
"""

import os
import sys
import tempfile

try:
    import tomllib
except ImportError:
    tomllib = None

OFF = {"ignore": "exit 0", "command": "exit 1"}
CONTEXTS = ("production", "branch-deploy", "deploy-preview")
FIX = 'production and branch deploys keep ignore = "exit 0" and command = "exit 1"; previews go in [context.deploy-preview]'


def problems(path):
    try:
        with open(path, "rb") as f:
            cfg = tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError) as e:
        return [f"{path}: {e}"]
    found = [f"[build] {k} must be {v!r}" for k, v in OFF.items() if cfg.get("build", {}).get(k) != v]
    contexts = cfg.get("context", {})
    found += [f"[context.{c}] is not allowed: only {', '.join(CONTEXTS)}" for c in contexts if c not in CONTEXTS]
    for c in ("production", "branch-deploy"):
        found += [f"[context.{c}] {k} must be {v!r}" for k, v in OFF.items() if contexts.get(c, {}).get(k) != v]
    found += [f"[context.{c}] must not nest a build table" for c, t in contexts.items() if "build" in t]
    return found


GOOD = """[build]
  ignore = "exit 0"
  command = "exit 1"

[context.production]
  ignore = "exit 0"
  command = "exit 1"

[context.branch-deploy]
  ignore = "exit 0"
  command = "exit 1"

[context.deploy-preview]
  ignore = "./scripts/netlify-ignore-build.sh"
  command = "./scripts/netlify-preview-build.sh"
"""

# Each must fail: (label, text replaced, replacement), applied to GOOD; "" appends.
BAD = [
    ("[build] builds", '[build]\n  ignore = "exit 0"\n  command = "exit 1"', '[build]\n  ignore = "exit 0"\n  command = "yarn build"'),
    ("production builds", '[context.production]\n  ignore = "exit 0"', '[context.production]\n  ignore = "true"'),
    ("branch deploys build", '[context.branch-deploy]\n  ignore = "exit 0"\n  command = "exit 1"', '[context.branch-deploy]\n  ignore = "exit 0"\n  command = "yarn build"'),
    ("a branch-named context", "", '[context.next]\n  command = "yarn build"\n'),
    ("a nested build table", "", '[context.deploy-preview.build]\n  command = "yarn build"\n'),
    ("a duplicate key", "[build]\n", '[build]\n  ignore = "true"\n'),
]


def self_test():
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "netlify.toml")
        cases = [("the allowed shape", GOOD, False)]
        cases += [(label, GOOD.replace(old, new, 1) if old else GOOD + new, True) for label, old, new in BAD]
        for label, text, should_fail in cases:
            with open(path, "w") as f:
                f.write(text)
            if bool(problems(path)) != should_fail:
                print(f"self-test: {label}: {'accepted' if should_fail else 'rejected'}", file=sys.stderr)
                failed = 1
    if not failed:
        print(f"check_netlify_toml self-test: {len(BAD)} rejected, 1 accepted")
    return failed


def main(argv):
    if len(argv) != 1:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    if tomllib is None:
        if os.environ.get("CI") == "1":
            print("check_netlify_toml: needs Python 3.11+ (tomllib)", file=sys.stderr)
            return 1
        print("WARNING: netlify.toml not checked: needs Python 3.11+ (tomllib); CI checks it", file=sys.stderr)
        return 0
    if argv[0] == "--self-test":
        return self_test()
    found = problems(argv[0])
    if found:
        print(f"{argv[0]} would let more than deploy previews build:", file=sys.stderr)
        for p in found:
            print(f"  {p}", file=sys.stderr)
        print(f"  fix: {FIX}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

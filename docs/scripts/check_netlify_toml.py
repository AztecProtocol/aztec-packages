#!/usr/bin/env python3
"""Fails unless a netlify.toml builds exactly what the docs site should.

aztec-docs-dev builds docs/ from this repository. Production (docs.aztec.network, from `next`) and
deploy previews each run one fixed ignore/build pair; branch deploys never build. `ignore` fails
open (any non-zero exit builds), so contexts that never build also fail in `command`. Netlify
applies branch-named contexts over [context.production], so no other context may exist, and each
context is compared as a whole table, so an extra key (`environment`, `publish`, a nested build
table) fails too.

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
# The publish directory is a site setting (build/); a `publish` key here would override it.
BUILD = {**OFF, "functions": "netlify/functions"}
CONTEXTS = {
    "production": {"ignore": "./scripts/netlify-ignore-build.sh production", "command": "./scripts/netlify-build.sh"},
    "deploy-preview": {"ignore": "./scripts/netlify-ignore-build.sh preview", "command": "./scripts/netlify-build.sh"},
    "branch-deploy": OFF,
}


def problems(path):
    try:
        with open(path, "rb") as f:
            cfg = tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError) as e:
        return [f"{path}: {e}"]
    found = [f"[build] must be exactly {BUILD!r}"] if cfg.get("build") != BUILD else []
    contexts = cfg.get("context", {})
    found += [f"[context.{c}] is not allowed: only {', '.join(CONTEXTS)}" for c in contexts if c not in CONTEXTS]
    found += [f"[context.{c}] must be exactly {t!r}" for c, t in CONTEXTS.items() if contexts.get(c) != t]
    return found


GOOD = """[build]
  ignore = "exit 0"
  command = "exit 1"
  functions = "netlify/functions"

[context.production]
  ignore = "./scripts/netlify-ignore-build.sh production"
  command = "./scripts/netlify-build.sh"

[context.branch-deploy]
  ignore = "exit 0"
  command = "exit 1"

[context.deploy-preview]
  ignore = "./scripts/netlify-ignore-build.sh preview"
  command = "./scripts/netlify-build.sh"
"""

# Each must fail: (label, text replaced, replacement), applied to GOOD; "" appends.
BAD = [
    ("[build] builds", '[build]\n  ignore = "exit 0"\n  command = "exit 1"', '[build]\n  ignore = "exit 0"\n  command = "yarn build"'),
    ("[build] changes the publish directory", "[build]\n", '[build]\n  publish = "."\n'),
    ("production builds without the decision", '[context.production]\n  ignore = "./scripts/netlify-ignore-build.sh production"\n', "[context.production]\n"),
    ("production decides but cannot build", '  command = "./scripts/netlify-build.sh"\n\n[context.branch-deploy]', '  command = "exit 1"\n\n[context.branch-deploy]'),
    ("production with an extra key", "[context.production]\n", '[context.production]\n  publish = "elsewhere"\n'),
    ("a changed preview pair", 'preview"\n  command = "./scripts/netlify-build.sh"', 'preview"\n  command = "yarn build"'),
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
        print(f"{argv[0]} would build more, or other, than production and deploy previews:", file=sys.stderr)
        for p in found:
            print(f"  {p}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

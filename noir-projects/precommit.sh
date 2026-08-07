#!/usr/bin/env bash
# Compatibility shim: pre-commit hooks installed by an older bootstrap.sh install_hooks still call
# this path. The real hook lives in labs/; re-running `bootstrap.sh hooks` installs a hook that
# calls it directly.
set -euo pipefail

cd $(dirname $0)

./labs/precommit.sh

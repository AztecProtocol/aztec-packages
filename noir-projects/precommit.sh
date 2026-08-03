#!/usr/bin/env bash
# Compatibility shim: pre-commit hooks installed by an older bootstrap.sh install_hooks still call
# this path. The real hooks live in fnd/ and labs/ (one per side of the repo split); re-running
# `bootstrap.sh hooks` installs a hook that calls them directly.
set -euo pipefail

cd $(dirname $0)

./fnd/precommit.sh
./labs/precommit.sh

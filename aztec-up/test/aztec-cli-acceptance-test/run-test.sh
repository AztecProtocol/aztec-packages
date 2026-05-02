#!/usr/bin/env bash
# Launcher for the Aztec CLI acceptance test.
#
# Steps:
#   1. Install Node LTS via NVM if missing or < 22 (skipped with SKIP_INSTALL=1)
#   2. Install the Aztec toolchain via the public installer (skipped with SKIP_INSTALL=1)
#   3. Run aztec-cli-acceptance-test.ts which exercises the installed toolchain end-to-end
#
# Why we care about the Node version: the .ts test file is run directly via
# `node --no-warnings ...ts`, which relies on built-in typestripping (Node 22.6+).
# GitHub's ubuntu-latest ships Node 20, so a naive `command -v node` check leaves
# the runner on a Node that errors with ERR_UNKNOWN_FILE_EXTENSION.
#
# Env vars:
#   SKIP_INSTALL=1      Skip steps 1-2 and use the already-installed toolchain (dev-box inner loop).
#   VERSION=<semver>    Version to install (e.g. 4.3.0 or v4.3.0). Required unless SKIP_INSTALL=1.
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

if [ "${SKIP_INSTALL:-0}" = "1" ]; then
  echo ">>> Skipping install (SKIP_INSTALL=1)"
else
  if [ -z "${VERSION:-}" ]; then
    echo "ERROR: VERSION must be set when SKIP_INSTALL is not 1." >&2
    exit 1
  fi
  # Native execution of aztec-cli-acceptance-test.ts requires Node 22.6+ (typestripping).
  # GitHub's ubuntu-latest ships Node 20, which fails with ERR_UNKNOWN_FILE_EXTENSION on .ts.
  node_major=0
  if command -v node &>/dev/null; then
    node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  fi
  if [ "$node_major" -lt 22 ]; then
    echo ">>> Installing Node LTS via NVM (found node major=$node_major, need >=22)"
    if [ ! -f "$HOME/.nvm/nvm.sh" ]; then
      curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh -o /tmp/nvm-install.sh
      PROFILE=/dev/null bash /tmp/nvm-install.sh
    fi
    export NVM_DIR="$HOME/.nvm"
    set +eu; . "$NVM_DIR/nvm.sh"; set -eu
    nvm install --lts
    nvm use --lts
  fi
  echo ">>> Installing aztec ${VERSION}"
  NO_NEW_SHELL=1 VERSION="${VERSION}" bash <(curl -sL https://install.aztec.network)
fi

# The aztec installer may have installed a newer Node via NVM. Source NVM so the
# rest of this script (and the exec below) uses it instead of the system Node.
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  set +eu; . "$HOME/.nvm/nvm.sh"; set -eu
fi

# Mirrors update_path_env_var() in aztec-install — profile files aren't sourced in non-interactive shells.
export PATH="$HOME/.aztec/current/bin:$HOME/.aztec/bin:$PATH"
export AZTEC_INSTALL_DIR="${AZTEC_INSTALL_DIR:-$HOME/.aztec/current}"

echo ">>> Running test"
exec node --no-warnings "${script_dir}/aztec-cli-acceptance-test.ts"

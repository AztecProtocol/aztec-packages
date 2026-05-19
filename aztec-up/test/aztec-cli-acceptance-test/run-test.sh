#!/usr/bin/env bash
# Launcher for the Aztec CLI acceptance test.
#
# Steps:
#   1. Install NVM and the latest LTS Node (skipped with SKIP_INSTALL=1). NVM is required by the
#      aztec installer to upgrade Node when the system version is too old.
#   2. Install the Aztec toolchain via the public installer (skipped with SKIP_INSTALL=1)
#   3. Run aztec-cli-acceptance-test.ts which exercises the installed toolchain end-to-end
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
  if [ ! -f "$HOME/.nvm/nvm.sh" ]; then
    echo ">>> Installing NVM"
    curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh -o /tmp/nvm-install.sh
    PROFILE=/dev/null bash /tmp/nvm-install.sh
  fi

  # Install latest LTS node, since we need it to run the acceptance test correctly
  export NVM_DIR="$HOME/.nvm"
  set +eu; . "$NVM_DIR/nvm.sh"; set -eu
  echo ">>> Installing latest LTS Node via NVM"
  nvm install --lts
  echo ">>> Installing aztec ${VERSION}"
  NO_NEW_SHELL=1 VERSION="${VERSION}" bash <(curl -sL https://install.aztec.network)
fi

# Mirrors update_path_env_var() in aztec-install — profile files aren't sourced in non-interactive shells.
export PATH="$HOME/.aztec/current/bin:$HOME/.aztec/bin:$PATH"
export AZTEC_INSTALL_DIR="${AZTEC_INSTALL_DIR:-$HOME/.aztec/current}"

echo ">>> Running test"
exec node --no-warnings "${script_dir}/aztec-cli-acceptance-test.ts"

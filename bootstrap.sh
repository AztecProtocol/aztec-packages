#!/usr/bin/env bash
# Usage:
# Bootstrap the repo from scratch:
#   ./bootstrap.sh full
# Bootstrap the repo using CI cache where possible to save on building:
#   ./bootstrap.sh fast
# Force a complete clean of the repo. Erases untracked files, be careful!
#   ./bootstrap.sh clean
set -eu

cd "$(dirname "$0")"

CMD=${1:-}

YELLOW="\033[93m"
RED="\033[31m"
BOLD="\033[1m"
RESET="\033[0m"

source ./build-system/scripts/setup_env '' '' '' > /dev/null

if [ "$CMD" = "clean" ]; then
  echo "WARNING: This will erase *all* untracked files, including hooks and submodules."
  echo -n "Continue? [y/n] "
  read user_input
  if [ "$user_input" != "y" ] && [ "$user_input" != "Y" ]; then
    exit 1
  fi

  # Remove hooks and submodules.
  rm -rf .git/hooks/*
  rm -rf .git/modules/*
  for SUBMODULE in $(git config --file .gitmodules --get-regexp path | awk '{print $2}'); do
    rm -rf $SUBMODULE
  done

  # Remove all untracked files, directories, nested repos, and .gitignore files.
  git clean -ffdx

  exit 0
elif [ "$CMD" = "full" ]; then
  if can_use_ci_cache; then
    echo -e "${BOLD}${YELLOW}WARNING: Performing a full bootstrap. Consider leveraging './bootstrap.sh fast' to use CI cache.${RESET}"
    echo
  fi
elif [ "$CMD" = "fast" ]; then
  export USE_CACHE=1
  if ! can_use_ci_cache; then
    echo -e "${BOLD}${YELLOW}WARNING: Either docker or aws credentials are missing. Install docker and request credentials. Note this is for internal aztec devs only.${RESET}"
    exit 1
  fi
else
  echo "usage: $0 <full|fast|clean>"
  exit 1
fi

# Install pre-commit git hooks.
HOOKS_DIR=$(git rev-parse --git-path hooks)
echo "(cd barretenberg/cpp && ./format.sh staged)" >$HOOKS_DIR/pre-commit
chmod +x $HOOKS_DIR/pre-commit

git submodule update --init --recursive

function encourage_dev_container {
  echo -e "${BOLD}${RED}ERROR: Toolchain incompatability. We encourage use of our dev container. See build-images/README.md.${RESET}"
}

# Let's update PATH to find foundry where our build images puts it.
export PATH=/opt/foundry/bin:$PATH

# Checks for the major toolchains and their versions.
# This isn't an exhaustive check of all required tools and utilities, but covers the main ones and provides
# instuctions or hints on how to remedy.
# Developers should probably use the dev container in /build-images to ensure the smoothest experience.
function check_toolchains {
  # Check clang version.
  if ! clang++-16 --version > /dev/null; then
    encourage_dev_container
    echo "clang 16 not installed."
    echo "Installation: sudo apt install clang-16"
    exit 1
  fi
  # Check rust version.
  if ! rustup show | grep "1.73" > /dev/null; then
    encourage_dev_container
    echo "Rust version 1.73 not installed."
    echo "Installation:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.73.0"
    exit 1
  fi
  # Check wasi-sdk version.
  if ! cat /opt/wasi-sdk/VERSION 2> /dev/null | grep 22.0 > /dev/null; then
    encourage_dev_container
    echo "wasi-sdk-22 not found at /opt/wasi-sdk."
    echo "Use dev container, build from source, or you can install linux x86 version with:"
    echo "  curl -s -L https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-22/wasi-sdk-22.0-linux.tar.gz | tar zxf - && sudo mv wasi-sdk-22.0 /opt/wasi-sdk"
    exit 1
  fi
  # Check anvil version.
  for tool in forge anvil; do
    if ! $tool --version 2> /dev/null | grep de33b6a > /dev/null; then
      encourage_dev_container
      echo "$tool not in PATH or incorrect version (requires de33b6af53005037b463318d2628b5cfcaf39916)."
      echo "Installation: https://book.getfoundry.sh/getting-started/installation (requires rust 1.75)"
      echo "  curl -L https://foundry.paradigm.xyz | bash"
      echo "  foundryup -b de33b6af53005037b463318d2628b5cfcaf39916"
      exit 1
    fi
  done
  # Check node version.
  node_version=$(node -v | tr -d 'v')
  major=${node_version%%.*}
  rest=${node_version#*.}
  minor=${rest%%.*}
  if ((major < 18 || (major == 18 && minor < 19))); then
    encourage_dev_container
    echo "Node.js not in PATH or version is less than 18.19."
    echo "Installation: nvm install 18"
    exit 1
  fi
  # Check for yarn.
  if ! yarn --version > /dev/null; then
    encourage_dev_container
    echo "yarn not in PATH."
    echo "Installation: npm install --global yarn"
    exit 1
  fi
  # Check for solhint.
  if ! solhint --version > /dev/null; then
    encourage_dev_container
    echo "solhint not in PATH."
    echo "Installation: npm install --global solhint"
    exit 1
  fi
}

check_toolchains

PROJECTS=(
  barretenberg
  noir
  l1-contracts
  avm-transpiler
  noir-projects
  yarn-project
)

# Build projects locally
for P in "${PROJECTS[@]}"; do
  echo "**************************************"
  echo -e "\033[1mBootstrapping $P...\033[0m"
  echo "**************************************"
  echo
  (cd $P && ./bootstrap.sh)
  echo
  echo
done

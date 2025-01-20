#!/usr/bin/env bash
# Usage: ./bootstrap.sh <full|fast|check|clean>"
#   full: Bootstrap the repo from scratch.
#   fast: Bootstrap the repo using CI cache where possible to save time building.
#   check: Check required toolchains and versions are installed.
#   clean: Force a complete clean of the repo. Erases untracked files, be careful!
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Enable abbreviated output.
export DENOISE=1

cmd=${1:-}
[ -n "$cmd" ] && shift

function encourage_dev_container {
  echo -e "${bold}${red}ERROR: Toolchain incompatibility. We encourage use of our dev container. See build-images/README.md.${reset}"
}

# Checks for required utilities, toolchains and their versions.
# Developers should probably use the dev container in /build-images to ensure the smoothest experience.
function check_toolchains {
  # Check for various required utilities.
  for util in jq parallel awk git curl; do
    if ! command -v $util > /dev/null; then
      encourage_dev_container
      echo "Utility $util not found."
      echo "Installation: sudo apt install $util"
      exit 1
    fi
  done
  # Check cmake version.
  local cmake_min_version="3.24"
  local cmake_installed_version=$(cmake --version | head -n1 | awk '{print $3}')
  if [[ "$(printf '%s\n' "$cmake_min_version" "$cmake_installed_version" | sort -V | head -n1)" != "$cmake_min_version" ]]; then
    encourage_dev_container
    echo "Minimum cmake version 3.24 not found."
    exit 1
  fi
  # Check clang version.
  if ! clang++-16 --version | grep "clang version 16." > /dev/null; then
    encourage_dev_container
    echo "clang 16 not installed."
    echo "Installation: sudo apt install clang-16"
    exit 1
  fi
  # Check rust version.
  if ! rustup show | grep "1.75" > /dev/null; then
    encourage_dev_container
    echo "Rust version 1.75 not installed."
    echo "Installation:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.75.0"
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
  # Check foundry version.
  for tool in forge anvil; do
    if ! $tool --version 2> /dev/null | grep 25f24e6 > /dev/null; then
      encourage_dev_container
      echo "$tool not in PATH or incorrect version (requires 25f24e677a6a32a62512ad4f561995589ac2c7dc)."
      echo "Installation: https://book.getfoundry.sh/getting-started/installation"
      echo "  curl -L https://foundry.paradigm.xyz | bash"
      echo "  foundryup -i nightly-25f24e677a6a32a62512ad4f561995589ac2c7dc"
      exit 1
    fi
  done
  # Check Node.js version.
  local node_min_version="18.19.0"
  local node_installed_version=$(node --version | cut -d 'v' -f 2)
  if [[ "$(printf '%s\n' "$node_min_version" "$node_installed_version" | sort -V | head -n1)" != "$node_min_version" ]]; then
    encourage_dev_container
    echo "Minimum Node.js version $node_min_version not found (got $node_installed_version)."
    echo "Installation: nvm install $node_min_version"
    exit 1
  fi
  # Check for required npm globals.
  for util in corepack solhint; do
    if ! command -v $util > /dev/null; then
      encourage_dev_container
      echo "$util not found."
      echo "Installation: npm install --global $util"
      exit 1
    fi
  done
}

# Install pre-commit git hooks.
function install_hooks {
  hooks_dir=$(git rev-parse --git-path hooks)
  echo "(cd barretenberg/cpp && ./format.sh staged)" >$hooks_dir/pre-commit
  echo "./yarn-project/precommit.sh" >>$hooks_dir/pre-commit
  chmod +x $hooks_dir/pre-commit
}

function test_cmds {
  if [ "$#" -eq 0 ]; then
    # Ordered with longest running first, to ensure they get scheduled earliest.
    set -- yarn-project/end-to-end yarn-project noir-projects boxes barretenberg l1-contracts noir
  fi
  parallel -k --line-buffer './{}/bootstrap.sh test-cmds 2>/dev/null' ::: $@ | filter_test_cmds
}

function test {
  echo_header "test all"

  # Starting txe servers with incrementing port numbers.
  export NUM_TXES=8
  trap 'kill $(jobs -p) &>/dev/null || true' EXIT
  for i in $(seq 0 $((NUM_TXES-1))); do
    existing_pid=$(lsof -ti :$((45730 + i)) || true)
    [ -n "$existing_pid" ] && kill -9 $existing_pid
    # TODO: I'd like to use dump_fail here, but TXE needs to exit 0 on receiving a SIGTERM.
    (cd $root/yarn-project/txe && LOG_LEVEL=silent TXE_PORT=$((45730 + i)) yarn start) &>/dev/null &
  done
  echo "Waiting for TXE's to start..."
  for i in $(seq 0 $((NUM_TXES-1))); do
      while ! nc -z 127.0.0.1 $((45730 + i)) &>/dev/null; do sleep 1; done
  done

  # We will start half as many jobs as we have cpu's.
  # This is based on the slightly magic assumption that many tests can benefit from 2 cpus,
  # and also that half the cpus are logical, not physical.
  echo "Gathering tests to run..."
  local num_cpus=$(get_num_cpus)
  test_cmds $@ | parallelise $((num_cpus / 2))
}

function build {
  echo_header "pull submodules"
  denoise "git submodule update --init --recursive"

  check_toolchains

  # We use parallelism in each step, and keep a simple linear dependency order.
  projects=(
    noir
    # Acir tests depend on noir.
    barretenberg
    avm-transpiler
    # Uses noir for contract builds, barretenberg for VKs and the solidity verifier contract.
    noir-projects
    # Relies on solidity verifier contract built by noir-projects.
    l1-contracts
    # As the 'blockchain component', yarn-project combines the above.
    yarn-project
    # Boxes are demos for external devs, we use the above components.
    boxes
    # Docs pull parts of the above code as examples.
    docs
  )

  # Build projects.
  for project in "${projects[@]}"; do
    $project/bootstrap.sh ${1:-}
  done
}

case "$cmd" in
  "clean")
    echo "WARNING: This will erase *all* untracked files, including hooks and submodules."
    echo -n "Continue? [y/n] "
    read user_input
    if [[ ! "$user_input" =~ ^[yY](es)?$ ]]; then
      echo "Exiting without cleaning"
      exit 1
    fi

    # Remove hooks and submodules.
    rm -rf .git/hooks/*
    rm -rf .git/modules/*
    for submodule in $(git config --file .gitmodules --get-regexp path | awk '{print $2}'); do
      rm -rf $submodule
    done

    # Remove all untracked files, directories, nested repos, and .gitignore files.
    git clean -ffdx
  ;;
  "check")
    check_toolchains
    echo "Toolchains look good! 🎉"
  ;;
  "image-aztec")
    image=aztecprotocol/aztec:$(git rev-parse HEAD)
    docker pull --platform linux/$(arch) $image &>/dev/null || true
    if docker_has_image $image; then
      echo "Image $image already exists and has been downloaded." && exit
    else
      echo "Image $image does not exist, building..."
    fi
    echo_header "image-aztec"
    source $ci3/source_tmp
    echo "earthly artifact build:"
    scripts/earthly-ci --artifact +bootstrap-aztec/usr/src $TMP/usr/src
    echo "docker image build:"
    docker pull aztecprotocol/aztec-base:v1.0-$(arch)
    docker tag aztecprotocol/aztec-base:v1.0-$(arch) aztecprotocol/aztec-base:latest
    docker build -f Dockerfile.aztec -t $image $TMP
    if [ "${CI:-0}" = 1 ]; then
      docker push $image
    fi
  ;;
  "_image-e2e")
    image=aztecprotocol/end-to-end:$(git rev-parse HEAD)
    docker pull $image &>/dev/null || true
    if docker_has_image $image; then
      echo "Image $image already exists." && exit
    fi
    echo_header "image-e2e"
    source $ci3/source_tmp
    echo "earthly artifact build:"
    scripts/earthly-ci --artifact +bootstrap-end-to-end/usr/src $TMP/usr/src
    scripts/earthly-ci --artifact +bootstrap-end-to-end/anvil $TMP/anvil
    echo "docker image build:"
    docker pull aztecprotocol/end-to-end-base:v1.0-$(arch)
    docker tag aztecprotocol/end-to-end-base:v1.0-$(arch) aztecprotocol/end-to-end-base:latest
    docker build -f Dockerfile.end-to-end -t $image $TMP
    if [ "${CI:-0}" = 1 ]; then
      docker push $image
    fi
  ;;
  "image-e2e")
    parallel --line-buffer ./bootstrap.sh ::: image-aztec _image-e2e
  ;;
  "image-faucet")
    image=aztecprotocol/aztec-faucet:$(git rev-parse HEAD)
    if docker_has_image $image; then
      echo "Image $image already exists." && exit
    fi
    echo_header "image-faucet"
    source $ci3/source_tmp
    mkdir -p $TMP/usr
    echo "earthly artifact build:"
    scripts/earthly-ci --artifact +bootstrap-faucet/usr/src $TMP/usr/src
    echo "docker image build:"
    docker build -f Dockerfile.aztec-faucet -t $image $TMP
    if [ "${CI:-0}" = 1 ]; then
      docker push $image
    fi
  ;;
  ""|"fast"|"full")
    build $cmd
  ;;
  "test-cmds")
    test_cmds $@
  ;;
  "test")
    test $@
  ;;
  "ci")
    build
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    echo "usage: $0 <clean|full|fast|test|check|test-e2e|test-cache|test-boxes|test-kind-network|image-aztec|image-e2e|image-faucet>"
    exit 1
  ;;
esac

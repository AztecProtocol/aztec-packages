#!/usr/bin/env bash
# Install required dependencies first (and restart your shell):
#   ./bootstrap.sh install_deps
#
# Usage: ./bootstrap.sh [cmd]"
#   ./bootstrap.sh: Max parallelism. Only use on serious hardware.
#   ./bootstrap.sh gentle: Less parallelism. Gentler on hardware. Slow.
#   ./bootstrap.sh check: Check required toolchains and versions are installed.
#   ./bootstrap.sh clean: Force a complete clean of the repo. Erases untracked files, be careful!

### TOOLCHAIN INSTALLATIONS ############################################################################################
# Expected toolchain versions.
export expected_min_clang_version=20.0.0
export expected_min_cmake_version=3.24
export expected_min_node_version=24.12.0
export expected_min_zig_version=0.15.1
export expected_abs_rust_version=1.89.0
export expected_abs_wasi_version=27.0
export expected_abs_foundry_version=1.4.1
export expected_abs_yarn_version=4.13.0

function ensure {
  command -v $1 &>/dev/null
}

function install_wasi_sdk {
  if cat /opt/wasi-sdk/VERSION 2> /dev/null | grep $expected_abs_wasi_version > /dev/null; then
    return
  fi
  local arch=$(uname -m)
  local os=$(os)
  local triple=$expected_abs_wasi_version-$arch-$os
  curl -LOs https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${expected_abs_wasi_version%%.*}/wasi-sdk-$triple.tar.gz
  tar xzf wasi-sdk-$triple.tar.gz
  rm wasi-sdk-$triple.tar.gz
  echo "Installing wasi sdk at /opt/wasi-sdk..."
  sudo rm -rf /opt/wasi-sdk
  sudo mv wasi-sdk-$triple /opt/wasi-sdk
}

function install_foundry {
  curl -L https://foundry.paradigm.xyz | bash
  ~/.foundry/bin/foundryup -i $expected_abs_foundry_version
}

function install_zig {
  if ! ensure zvm; then
    curl -s https://www.zvm.app/install.sh | bash
    export PATH="$PATH:$HOME/.zvm/bin"
    export PATH="$PATH:$HOME/.zvm/self"
  fi
  zvm i $expected_min_zig_version
}

function install_rustup {
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain $expected_abs_rust_version
}

function install_node {
  if ! ensure nvm; then
    # Files need to exist if you want nvm installer to update them.
    case $SHELL in
      */zsh) touch $HOME/.zshrc ;;
      */bash) touch $HOME/.bashrc ;;
    esac
    curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    . "$HOME/.nvm/nvm.sh" --no-use
  fi
  nvm install --lts
  nvm alias default lts/*
}

function install_node_utils {
  . "$HOME/.nvm/nvm.sh"
  npm i -g corepack solhint
}

function install_llvm {
  wget https://apt.llvm.org/llvm.sh && \
    chmod +x llvm.sh && \
    ./llvm.sh 20 all && \
    rm llvm.sh
}

function install_yq {
  curl -sL https://github.com/mikefarah/yq/releases/download/v4.42.1/yq_linux_$(dpkg --print-architecture) \
    -o $AZTEC_DEV_BIN/yq && chmod +x $AZTEC_DEV_BIN/yq
}

function install_ldid {
  curl -sL https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus7/ldid_linux_x86_64 \
    -o $AZTEC_DEV_BIN/ldid && chmod +x $AZTEC_DEV_BIN/ldid
}

export -f install_wasi_sdk install_foundry install_zig install_rustup install_node install_node_utils install_llvm \
          install_yq install_ldid ensure

function install_linux_deps {
  if ! ensure apt; then
    echo "Installation requires the apt package manager."
    exit 1
  fi
  mkdir -p "$AZTEC_DEV_BIN"
  spinner "Installing apt dependencies..." "sudo apt install -y jq parallel curl wget zstd redis-tools lsb-release software-properties-common gnupg build-essential cmake ninja-build xxd doxygen"
  spinner "Installing llvm..." install_llvm
  spinner "Installing yq..." install_yq
  spinner "Installing ldid..." install_ldid
  spinner "Installing rustup..." install_rustup
  spinner "Installing wasi-sdk..." install_wasi_sdk
  spinner "Installing foundry..." install_foundry
  spinner "Installing zig..." install_zig
  spinner "Installing node..." install_node
  spinner "Installing node utils..." install_node_utils
}

function install_macos_deps {
  # Check if brew is available.
  if ! ensure brew; then
    echo "Installation requires Homebrew."
    echo "Install it from https://brew.sh"
    exit 1
  fi
  spinner "Installing brew dependencies..." \
    "brew install cmake ninja llvm@20 doxygen coreutils grep gnu-sed parallel yq zstd redis util-linux libusb jq bash"

  # Make clang 20 available.
  local llvm_bin="$(brew --prefix)/Cellar/llvm@20/20.1.8/bin"
  mkdir -p "$AZTEC_DEV_BIN"
  ln -sf "$llvm_bin/clang" "$AZTEC_DEV_BIN/clang-20"
  ln -sf "$llvm_bin/clang++" "$AZTEC_DEV_BIN/clang++-20"
  ln -sf "$llvm_bin/clang-format" "$AZTEC_DEV_BIN/clang-format-20"

  spinner "Installing wasi-sdk..." install_wasi_sdk
  spinner "Installing foundry..." install_foundry
  spinner "Installing rustup..." install_rustup
  spinner "Installing zig..." install_zig
  spinner "Installing node..." install_node
  spinner "Installing node utils..." install_node_utils
}

function install_deps {
  case "$(os)" in
    linux) install_linux_deps ;;
    macos) install_macos_deps ;;
    *)
      echo -e "${bold}${red}Unknown operating system.${reset}"
      echo "We encourage use of our dev container. See build-images/README.md."
      exit 1
      ;;
  esac

  echo
  if [ -t 0 ]; then
    echo "Done! Starting fresh shell..."
    exec $SHELL
  else
    echo "Done! You'll need to start a fresh shell to see PATH updates."
    echo
  fi
}

# Special case for installing dependencies (can run on older bash).
if [ "${1:-}" = "install_deps" ]; then
  set -euo pipefail
  source $(git rev-parse --show-toplevel)/ci3/source_base
  install_deps
  exit 0
fi

### START OF MAIN BOOTSTRAP SCRIPT #####################################################################################
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Enable abbreviated output by default.
export DENOISE=${DENOISE:-1}

# Number of TXE servers to run when testing.
export NUM_TXES=1

# Number of jobs for make. Defaults to number of CPUs.
# TODO: We should dial this back on consumer hardware, maybe to just 1.
export MAKEFLAGS="-j${MAKE_JOBS:-$(get_num_cpus)}"

# We append all test commands to this file as they become available during build.
# The test engine feeds it into parallel.
export test_cmds_file="/tmp/test_cmds"
export bench_cmds_file="/tmp/bench_cmds"

### CLEANUP ON EXIT ####################################################################################################
function cleanup {
  set +e
  if [ -n "${test_engine_pid:-}" ]; then
    echo "Sending SIGTERM to test engine process group..."
    kill -SIGTERM -- -$test_engine_pid &>/dev/null
    wait $test_engine_pid
    test_engine_pid=
  fi
  if [ -n "${make_pid:-}" ]; then
    echo "Sending SIGTERM to make process..."
    kill -SIGTERM $make_pid &>/dev/null
    wait $make_pid
    make_pid=
  fi
  stop_txes
}
trap cleanup EXIT

### TOOLCHAIN CHECKS ###################################################################################################
function check_minimum_version {
  local min_version=$1
  local installed_version=$2
  if [[ "$(printf '%s\n' "$min_version" "$installed_version" | sort -V | head -n1)" != "$min_version" ]]; then
    return 1
  fi
  return 0
}

function toolchain_incompatible {
  if [ "$(os)" == "unknown" ] || [ "$(os)" == "linux" ] && ! ensure apt; then
    echo -e "${bold}${red}ERROR: Toolchain incompatibility.${reset}"
    echo "We encourage use of our dev container. See build-images/README.md."
  else
    echo -e "${bold}${red}ERROR: Toolchain incompatibility.${reset}"
    echo "You can install requirements with: ./bootstrap.sh install_deps"
  fi
  exit 1
}

# Checks for required utilities, toolchains and their versions.
# DO NOT INSTALL THINGS IN HERE.
function check_toolchains {
  # Check for various required utilities.
  for util in jq parallel awk git curl zstd corepack solhint; do
    if ! ensure $util; then
      echo "$util not found."
      toolchain_incompatible
    fi
  done
  if [ "$(os)" == "linux" ] && ! ensure ldid; then
    echo "ldid not found."
    toolchain_incompatible
  fi
  if ! yq --version | grep "version v4" > /dev/null; then
    echo "yq not found."
    toolchain_incompatible
  fi
  # Check cmake version.
  local cmake_installed_version=$(cmake --version | head -n1 | awk '{print $3}')
  if ! check_minimum_version $expected_min_cmake_version $cmake_installed_version; then
    echo "Minimum cmake version $expected_min_cmake_version not found."
    toolchain_incompatible
  fi
  # Check clang version.
  # Use -dumpversion (bare X.Y.Z) instead of parsing --version, whose first-line
  # format differs across distros (e.g. Ubuntu prepends "Ubuntu " so the version
  # is field 4, whereas plain LLVM puts it in field 3).
  local clang_installed_version=$(clang++-20 -dumpversion)
  if ! check_minimum_version $expected_min_clang_version $clang_installed_version; then
    echo "Minimum clang version $expected_min_clang_version not found."
    toolchain_incompatible
  fi
  # Check zig version.
  local zig_installed_version=$(zig version)
  if ! check_minimum_version $expected_min_zig_version $zig_installed_version; then
    echo "Minimum zig version $expected_min_zig_version not found."
    toolchain_incompatible
  fi
  # Check rustup installed.
  if ! ensure rustup; then
    echo "Rustup not installed."
    toolchain_incompatible
  fi
  if ! rustup show | grep $expected_abs_rust_version > /dev/null; then
    # Cargo will download necessary version of rust at runtime but warn to update the build-image.
    echo -e "${bold}${yellow}WARN: Rust ${expected_abs_rust_version} is not installed. Update build-image.${reset}"
  fi
  # Check wasi-sdk version.
  if ! cat /opt/wasi-sdk/VERSION 2> /dev/null | grep $expected_abs_wasi_version > /dev/null; then
    toolchain_incompatible
  fi
  # Check foundry version.
  for tool in forge anvil; do
    if ! $tool --version 2> /dev/null | grep "$expected_abs_foundry_version" > /dev/null; then
      echo "$tool version $expected_abs_foundry_version not found."
      toolchain_incompatible
    fi
  done
  # Check Node.js version.
  local node_installed_version=$(node --version | cut -d 'v' -f 2)
  if ! check_minimum_version $expected_min_node_version $node_installed_version; then
    echo "Minimum node version $expected_min_node_version not found."
    toolchain_incompatible
  fi
  # Check yarn version. This catches oddities like an overriding .yarnrc.yml outside the repo.
  if [ "$expected_abs_yarn_version" != "$(corepack yarn@$expected_abs_yarn_version --version)" ]; then
    echo "Yarn version $expected_abs_yarn_version not found. Check for a rogue .yarnrc.yml in e.g. home directory."
    toolchain_incompatible
  fi
}

### BUILDING AND TESTING ###############################################################################################
# Install pre-commit git hooks.
function install_hooks {
  hooks_dir=$(git rev-parse --git-path hooks)
  rm -f $hooks_dir/*

  cat <<EOF >$hooks_dir/pre-commit
#!/usr/bin/env bash
set -euo pipefail
(cd barretenberg/cpp && ./format.sh staged)
./yarn-project/precommit.sh
./noir/precommit.sh
./noir-projects/precommit.sh
./yarn-project/constants/precommit.sh
./docs/examples/ts/precommit.sh
EOF
  chmod +x $hooks_dir/pre-commit

  cat <<EOF >$hooks_dir/post-merge
#!/usr/bin/env bash
set -euo pipefail
git submodule update --init --recursive
EOF
  chmod +x $hooks_dir/post-merge
}

function pull_submodules {
  echo_header "pull submodules"
  # If it's an old standalone noir clone, nuke it.
  if [ -d "noir/noir-repo/.git" ]; then
    echo "Removing old noir clone..."
    rm -rf noir/noir-repo
  fi
  denoise "git submodule update --init --recursive --depth 1 --jobs 8 && git -C noir/noir-repo fetch --tags &>/dev/null"
}

function start_txes {
  # Until Kev's kzg lib stops using Tokio.
  export TOKIO_WORKER_THREADS=1

  kill_port() {
    local port=$1
    local existing_pid=$(lsof -ti :$port || true)
    if [ -n "$existing_pid" ]; then
      echo "Killing existing process $existing_pid on port: $port"
      check_port $port
      kill -9 $existing_pid &>/dev/null || true
      while kill -0 $existing_pid &>/dev/null; do sleep 0.1; done
    fi
  }

  # Starting txe servers with incrementing port numbers.
  # Base port is below the Linux ephemeral range (32768-60999) to avoid conflicts.
  local txe_base_port=14730
  for i in $(seq 0 $((NUM_TXES-1))); do
    port=$((txe_base_port + i))
    kill_port $port
    dump_fail "LOG_LEVEL=info TXE_PORT=$port retry 'node --no-warnings ./yarn-project/txe/dest/bin/index.js'" &
    txe_pids+="$! "
  done

  # Start the oracle test resolver for __oracle_test__-prefixed tests.
  local resolver_port=14830
  kill_port $resolver_port
  dump_fail "LOG_LEVEL=error ORACLE_TEST_PORT=$resolver_port node --no-warnings ./yarn-project/txe/dest/bin/oracle_test_server.js" &
  txe_pids+="$! "

  wait_for_port() {
    local port=$1 name=$2 j=0
    echo "Waiting for $name to start..."
    while ! nc -z 127.0.0.1 $port &>/dev/null; do
      if [ $j == 60 ]; then
        echo_stderr "$name failed to start on port $port after 60s."
        check_port $port
        exit 1
      fi
      sleep 1
      j=$((j+1))
    done
  }
  for i in $(seq 0 $((NUM_TXES-1))); do
    wait_for_port $((txe_base_port + i)) "TXE $i"
  done
  wait_for_port $resolver_port "oracle test resolver"
}

function stop_txes {
  if [ -n "${txe_pids:-}" ]; then
    echo "Stopping TXE processes..."
    kill -SIGTERM $txe_pids &>/dev/null || true
    wait $txe_pids || true
    txe_pids=
  fi
}

function prep {
  check_toolchains
  pull_submodules
}

function build {
  prep
  echo_header "build"
  make ${1:-fast}
}

function build_and_test {
  prep
  echo_header "build and test"

  # Start the test engine.
  rm -f $test_cmds_file
  touch $test_cmds_file
  # put it in it's own process group, we can terminate on cleanup.
  setsid color_prefix "test-engine" "denoise \"test_engine $test_cmds_file\"" &
  # setsid makes the child the session leader, so its PID is its PGID.
  test_engine_pid=$!
  echo "Started test engine with PGID $test_engine_pid."

  # Start the build.
  make $1 &
  make_pid=$!

  # As soon as one of the above fails, terminate the other (as part of exit cleanup).
  while [ -n "$make_pid" ] || [ -n "$test_engine_pid" ]; do
    # This will return success only if build or test succeeds.
    # Otherwise it's an error, which is an exit, which means we enter cleanup.
    wait -p finished -n $make_pid $test_engine_pid &>/dev/null

    # If make succeeded, start txes and add tests that depend on them.
    if [ "$finished" == "$make_pid" ]; then
      echo "Makefile build complete, starting TXEs and adding dependent tests..."
      make_pid=

      # TODO: Handle this better so they can be run as part of the Makefile dependency tree.
      start_txes
      make noir-projects-txe-tests

      # Benches (full builds only). Uploadable runs (BENCH_UPLOAD=1 — the first instance of
      # a run) bench on a dedicated fixed-hardware box for stable numbers: launched here,
      # logged like the test engine, waited on below, and the sole uploader. Everything
      # else benches inline as ordinary tests — a breakage check only, no upload.
      if [ "$1" == full ]; then
        if [ "${BENCH_UPLOAD:-0}" == 1 ]; then
          setsid color_prefix "bench" "denoise './ci.sh bench'" & bench_pid=$!
        else
          bench_cmds >> $test_cmds_file
        fi
      fi

      # Signal tests complete, handled by parallel -E STOP.
      echo STOP >> $test_cmds_file
    fi

    if [ "$finished" == "$test_engine_pid" ]; then
      echo "Test engine completed successfully."
      test_engine_pid=
    fi
  done

  stop_txes

  # Benches (full builds only). Inline benches above are a breakage check only — the
  # dedicated box is the sole uploader. Wait on it here: fatal, matching the old inline
  # `bench`, since a benchmark that fails to build/run is a real breakage.
  if [ "$1" == full ] && [ -n "${bench_pid:-}" ]; then
    echo "Waiting for dedicated bench run..."
    wait "$bench_pid"
  fi

  return 0
}

function bench_cmds {
  if [ "$#" -eq 0 ]; then
    set -- yarn-project/end-to-end yarn-project barretenberg/{ts,cpp,sol} noir-projects/{noir-protocol-circuits,noir-contracts} l1-contracts
  fi
  parallel -k --line-buffer './{}/bootstrap.sh bench_cmds' ::: $@
}

function bench_merge {
  find . -path "*/bench-out/*.bench.json" -type f -print0 | \
  xargs -0 -I{} bash -c '
    dir=$1; \
    dir=${dir#./}; \
    dir=${dir%/bench-out*}; \
    jq --arg prefix "$dir/" '\''map(.name |= "\($prefix)\(.)")'\'' "$1"
  ' _ {} | jq -s "add // []" > bench-out/bench.json

}

# Merge all component bench-out/*.bench.json into one and upload it to the
# bench-<treehash> cache key, which the GA "Upload benchmarks" step then publishes.
# Used both by `bench` (dedicated box) and by the inline benches-as-tests path.
function bench_publish {
  rm -rf bench-out
  mkdir -p bench-out
  bench_merge
  cache_upload bench-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
}

function bench {
  # TODO bench for arm64.
  if [ $(arch) == arm64 ]; then
    return
  fi
  echo_header "bench all"
  bench_cmds > $bench_cmds_file
  denoise "bench_engine $bench_cmds_file"
  bench_publish
}

### RELEASING ##########################################################################################################
function versions {
  local noir_version anvil_version node_version cmake_version clang_version zig_version rustc_version wasi_sdk_version
  noir_version=$(git -C noir/noir-repo describe --tags --always HEAD)
  anvil_version=$(anvil --version | head -n1 | sed -E 's/anvil Version: ([0-9.]+).*/\1/')
  node_version=$(node --version | cut -d 'v' -f 2)
  cmake_version=$(cmake --version | head -n1 | cut -d' ' -f3)
  clang_version=$(clang++-20 -dumpversion)
  zig_version=$(zig version)
  rustc_version=$(rustc --version | cut -d' ' -f2)
  wasi_sdk_version=$(cat /opt/wasi-sdk/VERSION 2> /dev/null | head -n1)
  echo "noir: $noir_version"
  echo "foundry: $anvil_version"
  echo "node: $node_version"
  echo "cmake: $cmake_version"
  echo "clang: $clang_version"
  echo "zig: $zig_version"
  echo "rustc: $rustc_version"
  echo "wasi-sdk: $wasi_sdk_version"
}

function release_bb_github {
  # Create a GitHub release in AztecProtocol/barretenberg for bb artifacts.
  # Users can manually create releases in aztec-packages via the GitHub UI if needed.
  local bb_repo="AztecProtocol/barretenberg"
  if gh release view "$REF_NAME" --repo "$bb_repo" &>/dev/null; then
    return
  fi
  local prerelease_flag=""
  if [ -n "$(semver prerelease $REF_NAME)" ]; then
    prerelease_flag="--prerelease"
  fi
  do_or_dryrun gh release create "$REF_NAME" \
    --repo "$bb_repo" \
    $prerelease_flag \
    --title "$REF_NAME" \
    --notes "Release $REF_NAME — see https://github.com/AztecProtocol/aztec-packages/commits/$COMMIT_HASH"
}

function release {
  # Releases are triggered when REF_NAME is a valid semver (but can have a leading v).
  # We ensure there is a github release for our REF_NAME.
  # We derive a dist tag from our prerelease portion of our REF_NAME semver. It is latest if no prerelease.
  echo_header "release all"
  set -x

  # A private release publishes only to our internal GCP Artifact Registry (the docker image and our
  # npm packages) — see private_release. ci3_labels_to_env.sh sets PRIVATE_RELEASE for every release in
  # the private repo; we ALSO backstop on the repo name here so the public release flow (DockerHub,
  # npmjs, crates.io, github) can never run in the private fork, even if that env var is missing or this
  # is invoked outside ci3.yml.
  if [ "${PRIVATE_RELEASE:-0}" = 1 ] ||
     [ "$(printf '%s' "${GITHUB_REPOSITORY:-}" | tr 'A-Z' 'a-z')" = "aztecprotocol/aztec-packages-private" ]; then
    private_release
    return
  fi

  # Ensure we have a github release in AztecProtocol/barretenberg for bb artifacts.
  # Users can create aztec-packages releases manually via the GitHub "Create a release" button.
  release_bb_github

  projects=(
    barretenberg/cpp
    ipc-runtime
    wsdb
    barretenberg/ts
    barretenberg/rust
    noir
    l1-contracts
    noir-projects/aztec-nr
    protocol/constants-codegen
    yarn-project
    boxes
    aztec-up
    playground
    release-image
  )
  if [ $(arch) == arm64 ]; then
    projects=(
      release-image
    )
  fi

  for project in "${projects[@]}"; do
    $project/bootstrap.sh release
  done
}

function release_dryrun {
  DRY_RUN=1 release
}

function private_release {
  # Release flow for the private repo, run on a (nightly) ci-private-release PR. We publish only to our
  # internal GCP Artifact Registry: the docker image (release-image -> INTERNAL_DOCKER_REGISTRY that
  # GKE/staging pulls from) and the npm packages (barretenberg/ts, noir, ipc-runtime, wsdb,
  # protocol/constants-codegen, yarn-project -> the INTERNAL_NPM_REGISTRY npm repo). We run the release
  # step for real on exactly those components and do not invoke the others — the remaining release
  # sources publish public artifacts (github releases, crates.io, the aztec-up/playground S3 installers)
  # and are not interrelated with these.
  echo_header "private release"

  # Default to the private staging Artifact Registry; override via the INTERNAL_*_REGISTRY env vars.
  # Exported so the child project bootstraps and gcp_artifact_login inherit them.
  export INTERNAL_DOCKER_REGISTRY=${INTERNAL_DOCKER_REGISTRY:-us-west1-docker.pkg.dev/testnet-440309/aztec}
  export INTERNAL_NPM_REGISTRY=${INTERNAL_NPM_REGISTRY:-https://us-west1-npm.pkg.dev/testnet-440309/aztec-npm}

  # Activate the CI service account (gcp_artifact_login registers the docker credential helper and
  # activates the SA globally) and mint a short-lived access token for npm auth against the AR npm repo.
  ci3/gcp_artifact_login
  set +x  # Never echo the access token.
  export NPM_TOKEN=$(gcloud auth print-access-token)
  # Route our scope to the internal npm registry; public deps still resolve from the default registry
  # (npmjs), so publishes and yarn-project's install smoke-test both work. Everything we publish is
  # @aztec-scoped — the noir packages are renamed @noir-lang/* -> @aztec/noir-* on release. Exported so
  # deploy_npm and that smoke-test share one config.
  local npmrc reg
  reg="${INTERNAL_NPM_REGISTRY%/}/"
  npmrc=$(mktemp)
  (umask 077; {
    echo "@aztec:registry=$reg"
    echo "${reg#https:}:_authToken=\${NPM_TOKEN}"
  } > "$npmrc")
  export NPM_CONFIG_GLOBALCONFIG="$npmrc"
  set -x

  # Mirror external @aztec-scoped fork dependencies (e.g. the vendored "viem": "npm:@aztec/viem@x")
  # from public npm into our internal registry. Because we scope ALL of @aztec to the internal registry,
  # these forks — which we don't build/publish ourselves — must also live there, or installs of our
  # published packages 404 (this is what yarn-project's release smoke-test exercises). amd64 only; the
  # registry is shared across arches.
  if [ "$(arch)" != arm64 ]; then
    local spec name ver td
    for spec in $(grep -rhoE 'npm:@aztec/[a-zA-Z0-9_.-]+@[0-9][^"]*' yarn-project --include=package.json \
                  | sed 's/^npm://' | sort -u); do
      name="${spec%@*}"; ver="${spec##*@}"
      if npm view "${name}@${ver}" version >/dev/null 2>&1; then
        echo "Mirror: ${spec} already present in internal registry; skipping."
        continue
      fi
      echo "Mirror: copying ${spec} from public npm to internal registry."
      td=$(mktemp -d)
      # Override the @aztec scope registry for the fetch (our .npmrc points @aztec at the internal
      # registry, which doesn't have the fork yet); publish then uses the inherited @aztec->internal config.
      npm pack "${spec}" --@aztec:registry=https://registry.npmjs.org/ --pack-destination "$td" --quiet
      npm publish "$td"/*.tgz
      rm -rf "$td"
    done
  fi

  # Publish @aztec/l1-artifacts to the internal registry. 13 yarn-project packages depend on it at the
  # release version, so it must exist before yarn-project's release smoke-test installs them. amd64
  # only (npm packages are platform-independent; mirrors the publish guard below).
  if [ $(arch) != arm64 ]; then
    l1-contracts/bootstrap.sh release
  fi

  # Publish for real, in dependency order: bb.js, the noir packages, ipc-runtime, and wsdb must be on
  # the registry before yarn-project's release smoke-tests installing the @aztec packages that depend on
  # them. @aztec/world-state has a runtime dependency on @aztec/wsdb, and the ipc-codegen-generated
  # @aztec/wsdb in turn has a runtime dependency on @aztec/ipc-runtime, so ipc-runtime must precede wsdb.
  # npm packages are platform-independent, so only the docker image is published on arm64.
  local publish=(barretenberg/ts noir ipc-runtime wsdb protocol/constants-codegen yarn-project release-image)
  if [ $(arch) == arm64 ]; then
    publish=(release-image)
  fi
  for project in "${publish[@]}"; do
    $project/bootstrap.sh release
  done
}

function release_compat_e2e {
  # Runs e2e tests with contract artifacts from every prior stable release since 4.2.0 (the version
  # where we committed to backwards compatibility). Validates that old contract artifacts work on the
  # current release. Blocking for stable/RC releases; observational (non-blocking) for nightlies.
  # Set SKIP_COMPAT_E2E=1 to bypass (escape hatch via the ci-skip-compat-e2e label).
  if [ "${SKIP_COMPAT_E2E:-0}" = "1" ]; then
    echo "SKIP_COMPAT_E2E=1, skipping backwards compatibility e2e tests."
    return 0
  fi

  # Compat e2e only runs on amd64 — the arm64 release job just builds and publishes release-image.
  if [ "$(arch)" == arm64 ]; then
    echo "Skipping backwards compatibility e2e tests on arm64 (amd64 only)."
    return 0
  fi

  # TODO: bump when v5 commits to backwards-compatible contract artifacts.
  #   compat_major:       major version that has compat guarantees today.
  #   compat_min_version: earliest stable tag of that major to test against
  #                       (artifacts before this are incompatible due to oracle interface changes).
  local compat_major="4"
  local compat_min_version="4.2.0"

  local current_version major
  current_version=$(jq -r '."."' .release-please-manifest.json)
  major=$(semver major "$current_version")
  if [ "$major" != "$compat_major" ]; then
    echo "Compat e2e tests only apply to v${compat_major}. Current major: v${major}. Skipping."
    return 0
  fi

  # Fetch tags (EC2 clone may not have them). Fail loud: a silent fetch failure plus an empty
  # tag list would publish a real release with zero compat coverage.
  if ! git fetch origin 'refs/tags/v*:refs/tags/v*'; then
    echo "ERROR: failed to fetch release tags." >&2
    return 1
  fi

  # Discover stable tags for this major version (no prerelease suffixes).
  local versions=()
  local tag ver
  while IFS= read -r tag; do
    ver=${tag#v}
    # Include only versions >= compat_min_version (sort -V puts smaller first).
    if [ "$(printf '%s\n%s' "$compat_min_version" "$ver" | sort -V | head -1)" = "$compat_min_version" ]; then
      versions+=("$ver")
    fi
  done < <(git tag -l "v${major}.*" | grep -E "^v[0-9]+\.[0-9]+\.[0-9]+$" | sort -V)

  # Exclude the current tag when running on a release tag push.
  if [[ "${REF_NAME:-}" =~ ^v?([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    local current_tag="${BASH_REMATCH[1]}"
    local filtered=()
    local v
    for v in "${versions[@]}"; do
      [ "$v" != "$current_tag" ] && filtered+=("$v")
    done
    versions=("${filtered[@]}")
  fi

  if [ ${#versions[@]} -eq 0 ]; then
    echo "No prior stable versions found for v${major}.x (>= $compat_min_version). Skipping compat tests."
    return 0
  fi

  echo_header "Backwards compatibility e2e tests"
  echo "Testing against ${#versions[@]} prior stable version(s): ${versions[*]}"

  # Pre-populate the legacy contract cache on the host. Test containers run with --net=none, so the
  # jest resolver's on-demand npm install would fail with EAI_AGAIN. Install here where we have network.
  for ver in "${versions[@]}"; do
    node yarn-project/end-to-end/src/install_legacy_contracts.cjs "$ver"
  done

  # Build and run the compat test commands in an isolated subshell so the bespoke test settings
  # (no test cache, no fast-fail short-circuit) don't leak into the release build/publish that follows.
  # set -e re-enables errexit inside this subshell: the caller invokes release_compat_e2e with errexit
  # disabled (to capture its exit code), so without this a failed build/install would be masked.
  (
    set -e
    export USE_TEST_CACHE=0
    export CI_FULL=0
    export NO_FAIL_FAST=1
    build
    for ver in "${versions[@]}"; do
      yarn-project/end-to-end/bootstrap.sh compat_test_cmds "$ver"
    done | filter_test_cmds | parallelize
  )
}

### SELF TESTING #######################################################################################################
function test_bootstrap_linux {
  local name=linux-bootstrap-test-ubuntu
  docker volume rm $name-volume &>/dev/null || true
  trap "docker volume rm $name-volume &>/dev/null" EXIT
  docker run --rm -ti --name $name \
    --cpus=32 \
    --ulimit nofile=1048576:1048576 \
    -v $root:/aztec-packages:ro \
    --mount type=volume,src=$name-volume,dst=/root/aztec-packages \
    -w /root \
    ubuntu:24.04 bash -c "
set -euo pipefail
ulimit -n 65536
apt update && apt install -y git sudo
git config --global --add safe.directory /aztec-packages/.git
git clone --branch=$(git branch --show-current) /aztec-packages
cd aztec-packages
./bootstrap.sh install_deps </dev/null
bash -l -i -c 'ulimit -n 65536 && NO_CACHE=1 ./bootstrap.sh gentle'
  "
}

function test_bootstrap_macos {
  local version="${1:-26}"
  local name="bootstrap-test-$version"
  CPU_CORES=32 RAM_SIZE=32g /mnt/user-data/macos/launch_vm.sh $version "" $name
  trap "docker stop macos-$name" EXIT
  local ip=$(docker inspect -f '{{ .NetworkSettings.Networks.bridge.IPAddress }}' macos-$name)
  echo "Waiting for Mac VM ($name) to be accessible at $ip..."
  while ! nc -z $ip 22 &>/dev/null; do sleep 0.5; done
  /mnt/user-data/macos/ssh.sh $name bash -c 'cat > /tmp/mac_bootstrap.sh' <<REMOTE_EOF
set -euo pipefail
ulimit -n 65536
git clone --depth=1 --branch=$(git branch --show-current) https://github.com/aztecprotocol/aztec-packages
cd aztec-packages
./bootstrap.sh install_deps </dev/null
zsh -l -i -c "ulimit -n 65536 && NO_CACHE=1 ./bootstrap.sh gentle"
REMOTE_EOF
  /mnt/user-data/macos/ssh.sh $name -t zsh -l /tmp/mac_bootstrap.sh
}

### COMMAND HANDLER ####################################################################################################
# Handle our command line arguments.
# All the commands that start with ci-* are intended to be callable from
# a fresh repo. They are ideal for calling into from github actions on a new runner
# Current flow: ci3.yml -> .github/ci3.sh -> ci.sh -> this script on a fresh EC2 runner.
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
  "")
    install_hooks
    build
  ;;
  "gentle")
    install_hooks
    prep
    if [ -t 1 ]; then
      export DUMP_FAIL=1
    fi
    CMAKE_BUILD_PARALLEL_LEVEL=$(nproc --ignore=2) CARGO_BUILD_JOBS=$(nproc --ignore=2) MEMSUSPEND=1g make -j1 "$@"
  ;;

  ######################################
  # VARIANTS ON NORMAL PULL-REQUEST CI #
  ######################################
  "ci-fast")
    export CI=1
    export USE_TEST_CACHE=1
    export CI_FULL=0
    build_and_test fast
    ;;
  "ci-full")
    export CI=1
    export USE_TEST_CACHE=1
    export CI_FULL=1
    build_and_test full
    ;;
  "ci-full-no-test-cache")
    export CI=1
    export USE_TEST_CACHE=0
    export CI_FULL=1
    build_and_test full
    ;;
  "ci-bench")
    # Run on a dedicated, fixed, on-demand instance (launched by the build
    # instance via './ci.sh bench') for stable benchmark numbers. The build is a
    # near-instant cache pull, as the launching build instance already populated
    # the cache for this commit. No test engine; bench uploads bench-<treehash>.
    export CI=1
    export CI_FULL=1
    prep
    make bench
    bench
    ;;
  "ci-chonk-input-update")
    export CI=1
    export USE_TEST_CACHE=1
    export CI_FULL=0
    prep
    barretenberg/crs/bootstrap.sh
    barretenberg/cpp/bootstrap.sh chonk_input_update
    ;;
  "ci-grind-test")
    export CI=1
    export USE_TEST_CACHE=0

    full_cmd="${1:?full_cmd required}"
    timeout="${2:-}"
    jobs_pct="${3:-200}"
    memsuspend_pct="${4:-50}"
    commit="${5:-}"

    grind_test "$full_cmd" "$timeout" "$jobs_pct" "$memsuspend_pct" "$commit"
    ;;

  ##########################################
  # NETWORK DEPLOYMENTS WITH BENCHES/TESTS #
  ##########################################
  "ci-network-deploy")
    # Args: <env_file> <namespace> [docker_image] [test_set]
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    test_set="${4:-}"
    build
    # If no docker image provided, build and push to aztecdev
    if [ -z "$docker_image" ]; then
      release-image/bootstrap.sh push_pr
      docker_image="aztecprotocol/aztecdev:$(git rev-parse HEAD)"
    fi
    # Set up environment and deploy using spartan
    export NAMESPACE="$namespace"
    export AZTEC_DOCKER_IMAGE="$docker_image"
    deploy_exit_code=0
    spartan/bootstrap.sh network_deploy "${env_file}" "$test_set" || deploy_exit_code=$?
    # Merge and upload deploy benchmarks (deploy_network.sh writes to spartan/bench-out/)
    rm -rf bench-out
    mkdir -p bench-out
    bench_merge
    cache_upload deploy-bench-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
    exit $deploy_exit_code
    ;;
  "ci-network-tests")
    # Args: <env_file> <namespace>
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    build
    # Set up environment for tests
    export NAMESPACE="$namespace"
    spartan/bootstrap.sh network_tests "${env_file}"
    ;;
  "ci-network-kind-tests")
    export CI=1
    [ "${SKIP_BUILD:-0}" -eq 0 ] && build
    # Set the docker image to the locally built image and load it into KIND
    export AZTEC_DOCKER_IMAGE="aztecprotocol/aztec:$(git rev-parse HEAD)"
    spartan/bootstrap.sh kind
    kind load docker-image "$AZTEC_DOCKER_IMAGE"
    # Just one test for now
    spartan/bootstrap.sh test-kind-upgrade-rollup
    ;;
  "ci-network-bench")
    # Args: <env_file> <namespace> [docker_image]
    # Deploys network and runs benchmarks. Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    build
    export NAMESPACE="$namespace"
    if [ "${SKIP_NETWORK_DEPLOY:-0}" != "1" ]; then
      # If no docker image provided, build and push to aztecdev
      if [ -z "$docker_image" ]; then
        release-image/bootstrap.sh push_pr
        docker_image="aztecprotocol/aztecdev:$(git rev-parse HEAD)"
      fi
      export AZTEC_DOCKER_IMAGE="$docker_image"
      spartan/bootstrap.sh network_deploy "${env_file}"
    else
      echo "SKIP_NETWORK_DEPLOY=1, running benchmarks against existing network '$namespace'."
    fi
    # Run benchmarks
    spartan/bootstrap.sh network_bench "${env_file}"
    rm -rf bench-out
    mkdir -p bench-out
    bench_merge
    cache_upload spartan-bench-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
    ;;
  "ci-network-proving-bench")
    # Args: <env_file> <namespace> [docker_image]
    # Deploys network and runs proving benchmarks. Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    build
    export NAMESPACE="$namespace"
    if [ "${SKIP_NETWORK_DEPLOY:-0}" != "1" ]; then
      # If no docker image provided, build and push to aztecdev
      if [ -z "$docker_image" ]; then
        release-image/bootstrap.sh push_pr
        docker_image="aztecprotocol/aztecdev:$(git rev-parse HEAD)"
      fi
      export AZTEC_DOCKER_IMAGE="$docker_image"
      spartan/bootstrap.sh network_deploy "${env_file}"
    else
      echo "SKIP_NETWORK_DEPLOY=1, running proving benchmarks against existing network '$namespace'."
    fi
    spartan/bootstrap.sh proving_bench "${env_file}"
    rm -rf bench-out
    mkdir -p bench-out
    bench_merge
    cache_upload spartan-proving-bench-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
    ;;
  "ci-network-block-capacity-bench")
    # Args: <env_file> <namespace> [docker_image]
    # Deploys network and runs block capacity benchmarks. Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    build
    export NAMESPACE="$namespace"
    if [ "${SKIP_NETWORK_DEPLOY:-0}" != "1" ]; then
      # If no docker image provided, build and push to aztecdev
      if [ -z "$docker_image" ]; then
        release-image/bootstrap.sh push_pr
        docker_image="aztecprotocol/aztecdev:$(git rev-parse HEAD)"
      fi
      export AZTEC_DOCKER_IMAGE="$docker_image"
      spartan/bootstrap.sh network_deploy "${env_file}"
    else
      echo "SKIP_NETWORK_DEPLOY=1, running block capacity benchmarks against existing network '$namespace'."
    fi
    # Run block capacity benchmarks
    spartan/bootstrap.sh block_capacity_bench "${env_file}"
    rm -rf bench-out
    mkdir -p bench-out
    bench_merge
    cache_upload spartan-block-capacity-bench-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
    ;;
  "ci-network-bench-10tps")
    # Args: <env_file> <namespace> [docker_image]
    # Deploys bench-10tps and runs the 10-min sustained 10 TPS benchmark.
    # Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    # Cleanup is done separately via ci-network-teardown.
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    build
    export NAMESPACE="$namespace"
    if [ "${SKIP_NETWORK_DEPLOY:-0}" != "1" ]; then
      # If no docker image provided, build and push to aztecdev
      if [ -z "$docker_image" ]; then
        release-image/bootstrap.sh push_pr
        docker_image="aztecprotocol/aztecdev:$(git rev-parse HEAD)"
      fi
      export AZTEC_DOCKER_IMAGE="$docker_image"
      spartan/bootstrap.sh network_deploy "${env_file}"
    else
      echo "SKIP_NETWORK_DEPLOY=1, running the 10 TPS benchmark against existing network '$namespace'."
    fi
    # Run the 10 TPS benchmark
    spartan/bootstrap.sh bench_10tps "${env_file}"
    rm -rf bench-out
    mkdir -p bench-out
    bench_merge
    cache_upload spartan-bench-10tps-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
    ;;
  "ci-network-inclusion-sweep")
    # Args: <env_file> <namespace> [docker_image]
    # Runs one inclusion-sweep point (TARGET_TPS) on the given network.
    # The v4 run JSON (tagged BENCH_SWEEP_ID) is uploaded to GCS inside
    # bench_inclusion_point; deploy/teardown of each point's namespace is done by
    # the workflow, so this is normally called with SKIP_NETWORK_DEPLOY=1.
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    build
    export NAMESPACE="$namespace"
    if [ "${SKIP_NETWORK_DEPLOY:-0}" != "1" ]; then
      # If no docker image provided, build and push to aztecdev
      if [ -z "$docker_image" ]; then
        release-image/bootstrap.sh push_pr
        docker_image="aztecprotocol/aztecdev:$(git rev-parse HEAD)"
      fi
      export AZTEC_DOCKER_IMAGE="$docker_image"
      spartan/bootstrap.sh network_deploy "${env_file}"
    else
      echo "SKIP_NETWORK_DEPLOY=1, running inclusion-sweep point (${TARGET_TPS:-10} TPS) against existing network '$namespace'."
    fi
    # Run one inclusion-sweep point (TARGET_TPS / BENCH_SWEEP_ID from env).
    spartan/bootstrap.sh bench_inclusion_point "${env_file}"
    rm -rf bench-out
    mkdir -p bench-out
    bench_merge
    cache_upload spartan-bench-inclusion-${TARGET_TPS:-10}tps-$(git rev-parse HEAD^{tree}).tar.gz bench-out/bench.json
    ;;
  "ci-network-teardown")
    # Args: <env_file> <namespace>
    # Tears down a deployed network.
    export CI=1
    env_file="${1:?env_file is required}"
    namespace="${2:?namespace is required}"
    # Set up environment for teardown
    export NAMESPACE="$namespace"
    denoise "spartan/bootstrap.sh network_teardown ${env_file}"
    ;;

  ############
  # RELEASES #
  ############
  "ci-release")
    # Single command that tests and publishes a release. Runs the backwards-compatibility e2e
    # checks (blocking for stable/RC, observational for nightlies), then builds and publishes.
    # DRY_RUN=1 exercises the whole flow without publishing — this is how releases are tested in CI.
    export CI=1
    export USE_TEST_CACHE=1
    if ! semver check $REF_NAME; then
      exit 1
    fi

    # Backwards-compatibility e2e checks. A failure blocks stable/RC releases, but only warns on
    # nightlies (where compat coverage is observational) so the nightly publish still proceeds.
    # Toggle errexit explicitly rather than `release_compat_e2e || compat_rc=$?`: calling under `||`
    # suspends errexit for the whole function (and its subshell), masking build/setup failures there.
    compat_rc=0
    set +e
    release_compat_e2e
    compat_rc=$?
    set -e
    if [ "$compat_rc" -ne 0 ]; then
      if [[ "${REF_NAME:-}" == *-nightly.* ]]; then
        run_url="https://github.com/${GITHUB_REPOSITORY:-AztecProtocol/aztec-packages}/actions/runs/${RUN_ID:-unknown}"
        "$ci3/slack_notify" "Backwards compatibility e2e tests FAILED on nightly tag <${run_url}|${REF_NAME}>" "#team-fairies" || true
        echo "Compat e2e failed on nightly tag — continuing (non-blocking)."
      else
        echo "ERROR: backwards compatibility e2e tests failed — blocking release." >&2
        exit 1
      fi
    fi

    if [[ "$(semver prerelease $REF_NAME)" == private* ]]; then
      echo_header "Private fork release: $REF_NAME"
      echo "Creating GitHub release from public repo context (COMMIT_HASH=$COMMIT_HASH)..."
      release_bb_github
      echo "Fetching private source from aztec-packages-private..."
      git remote add private "https://x-access-token:${GITHUB_TOKEN}@github.com/AztecProtocol/aztec-packages-private.git"
      git fetch --depth 1 private "refs/tags/$REF_NAME"
      git worktree add aztec-private FETCH_HEAD
      cd aztec-private
      echo "Initializing submodules in private worktree..."
      git submodule update --init --recursive
      echo "Private worktree ready at $(pwd) (HEAD=$(git rev-parse --short HEAD)). Cache uploads disabled."
      export NO_CACHE_UPLOAD=1
      # Unset so child bootstrap.sh re-derives these from the worktree.
      unset COMMIT_HASH root
    fi
    ./bootstrap.sh build release
    ./bootstrap.sh release
    ;;

  "ci-private-release")
    # Local/dev entrypoint for the PRIVATE_RELEASE flow (see private_release): dry-run every project
    # except release-image, then publish release-image for real to the internal GCP Artifact Registry.
    # Same publishing path the private-release.yml workflow runs, minus EC2 and the compat-e2e gating.
    # Build first so the release-image (and the artifacts the dry-runs pack) exist; set SKIP_BUILD=1 to
    # reuse an existing build. Requires INTERNAL_DOCKER_REGISTRY + GCP creds (GCP_SA_KEY or
    # GOOGLE_APPLICATION_CREDENTIALS) in the environment.
    export CI=${CI:-1}
    export PRIVATE_RELEASE=1
    export REF_NAME=${REF_NAME:-v0.0.1-commit.$(git rev-parse --short HEAD)}
    # Local convenience: default GCP creds to ~/sa.json (the CI service-account key) when present.
    [ -z "${GCP_SA_KEY:-}" ] && [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -f "$HOME/sa.json" ] && \
      export GOOGLE_APPLICATION_CREDENTIALS="$HOME/sa.json"
    [ "${SKIP_BUILD:-0}" = 1 ] || ./bootstrap.sh build release
    ./bootstrap.sh release
    ;;

  ##########################
  # MERGE TRAIN CI SUBSETS #
  ##########################
  "ci-docs")
    export CI=1
    export USE_TEST_CACHE=1
    ./bootstrap.sh build yarn-project
    docs/bootstrap.sh ci
    ;;
  "ci-barretenberg-debug")
    export CI=1
    export NATIVE_PRESET=debug
    export AVM=0
    export AVM_TRANSPILER=0
    barretenberg/cpp/bootstrap.sh ci
    ;;
  "ci-barretenberg")
    export CI=1
    export USE_TEST_CACHE=1
    export AVM=0
    export AVM_TRANSPILER=0
    barretenberg/ts/bb.js/bootstrap.sh formatting
    barretenberg/crs/bootstrap.sh
    barretenberg/cpp/bootstrap.sh ci
    ;;
  "ci-barretenberg-full")
    export CI=1
    export CI_FULL=1
    export USE_TEST_CACHE=1
    export AVM=0
    export AVM_TRANSPILER=0
    pull_submodules
    noir/bootstrap.sh build_native  # Build nargo for acir_tests
    barretenberg/bootstrap.sh ci
    ;;

  #######################
  # AVM QA ONE OFF JOBS #
  #######################
  "ci-avm-inputs-collection")
    # Nightly job: Run e2e tests with AVM circuit inputs dumping, upload to cache
    export CI=1
    # Use tree hash for tarball name - consistent across all environments
    export AVM_INPUTS_HASH=$(git rev-parse HEAD^{tree})
    build
    yarn-project/end-to-end/bootstrap.sh test_and_collect_avm_inputs
    ;;
  "ci-avm-check-circuit")
    # Nightly job: Download cached AVM inputs and run check-circuit on each
    export CI=1
    # Use tree hash for tarball name - consistent across all environments
    export AVM_INPUTS_HASH=$(git rev-parse HEAD^{tree})
    build
    yarn-project/end-to-end/bootstrap.sh avm_check_circuit
    ;;
  ##########################################
  # ROLLUP UPGRADE DEPLOYMENT              #
  ##########################################
  "ci-deploy-rollup-upgrade")
    # Env vars: NETWORK, GCP_PROJECT_ID (for GCP secrets)
    # Args: <registry_address> [KEY=VALUE...]
    export CI=1
    build
    exec spartan/scripts/deploy_rollup_upgrade.sh "$@"
    ;;

  #################
  # SOCKET FIX    #
  #################
  "ci-socket-fix")
    export CI=1
    build
    scripts/socket-fix-ci.sh "$@"
    ;;

  ##############################################
  # Default handler, calls our above functions #
  ##############################################
  *)
    default_cmd_handler "$@"
    ;;
esac

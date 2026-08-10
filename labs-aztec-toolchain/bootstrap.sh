#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
TARGET_DIR=bin
BB_BINARY=bb
BB_AVM_BINARY=bb-avm
NARGO_BINARY=nargo
NOIR_PROFILER_BINARY=noir-profiler
ACVM_BINARY=acvm

function link_tool {
  local full_path=$1
  local name=$2
  # The link must be relative: the checkout gets mounted at other paths (e.g. the aztec-up test
  # container bind-mounts it at /home/ubuntu/aztec-packages), where an absolute target dangles.
  ln -sf "$(realpath --relative-to="$TARGET_DIR" "$full_path")" "$TARGET_DIR/$name"
  echo "Created symlink: $TARGET_DIR/$name -> $full_path"
}

function build_monorepo {
  echo "Setting up labs' aztec toolchain..."
  local bb_full_path="$ROOT/barretenberg/cpp/build/bin/$BB_BINARY"
  local nargo_full_path="$ROOT/noir/noir-repo/target/release/$NARGO_BINARY"
  local noir_profiler_full_path="$ROOT/noir/noir-repo/target/release/$NOIR_PROFILER_BINARY"

  if [ ! -f $bb_full_path ] || [ ! -f $nargo_full_path ] || [ ! -f $noir_profiler_full_path ]; then
    echo_stderr "Required binaries not found, exiting."
    echo_stderr "bb: $bb_full_path"
    echo_stderr "nargo: $nargo_full_path"
    echo_stderr "noir-profiler: $noir_profiler_full_path"
    exit 1
  fi

  mkdir -p "$TARGET_DIR"
  link_tool "$bb_full_path" "$BB_BINARY"
  link_tool "$nargo_full_path" "$NARGO_BINARY"
  link_tool "$noir_profiler_full_path" "$NOIR_PROFILER_BINARY"

  # These may legitimately be absent: bb-avm is skipped by AVM=0 builds, and noir releases
  # don't ship acvm (the noir-from-release flow). Link whatever exists; a consumer of an
  # absent binary fails at the point of use.
  local optional_path
  for optional_path in \
    "$ROOT/barretenberg/cpp/build/bin/$BB_AVM_BINARY" \
    "$ROOT/noir/noir-repo/target/release/$ACVM_BINARY"; do
    if [ -f "$optional_path" ]; then
      link_tool "$optional_path" "$(basename "$optional_path")"
    fi
  done

  echo "Done."
}

function build_labs {
  echo "Setting up labs' aztec toolchain..."
  # TODO(fcarreiro): Implement.
  echo_stderr "Not operational yet."
  exit 1
  mkdir -p "$TARGET_DIR"
}

function clean {
  rm -rf $TARGET_DIR
}

function build {
  build_monorepo
}

# The nargo release version (e.g. "1.0.0-beta.25"), read from the binary itself
# so it works both on the monorepo and in the labs repo. Note this is the base
# cargo version: a nargo built from a nightly or arbitrary commit still reports
# the version of the release it was cut from.
function noir_version {
  local nargo="$TARGET_DIR/$NARGO_BINARY"
  if [ ! -f "$nargo" ]; then
    echo_stderr "Cannot get noir version, nargo not found (build first): $nargo"
    exit 1
  fi
  "$nargo" --version | sed -n 's/^nargo version = //p'
}

function hash {
  local bb="$TARGET_DIR/$BB_BINARY"
  local nargo="$TARGET_DIR/$NARGO_BINARY"
  local noir_profiler="$TARGET_DIR/$NOIR_PROFILER_BINARY"
  if [ ! -f "$bb" ] || [ ! -f "$nargo" ] || [ ! -f "$noir_profiler" ]; then
    echo_stderr "Cannot compute toolchain hash, binaries not found (build first):"
    echo_stderr "bb: $(realpath -m "$bb")"
    echo_stderr "nargo: $(realpath -m "$nargo")"
    echo_stderr "noir-profiler: $(realpath -m "$noir_profiler")"
    exit 1
  fi
  # The toolchain's identity is the SOURCE identity of its providers, not the bytes of the
  # built binaries: bb/bb-avm get the current commit hash stamped into them on non-release
  # builds (inject_version in barretenberg/cpp/bootstrap.sh), so hashing bytes makes every
  # commit look like a new toolchain even when nothing changed — forcing downstream consumers
  # (e.g. every noir-contracts cache key) to rebuild and mass-regenerate VKs per commit.
  # Composing the upstream content hashes keys rebuilds on exactly the same inputs that decide
  # whether the binaries themselves rebuild. (A future labs-repo provisioning mode should use
  # the released toolchain's version string as its fixed identity instead.)
  #
  # The optional binaries contribute presence only: what the toolchain provides (including
  # their absence) is part of its identity, but their content is already covered by the
  # provider hashes.
  local provided=""
  local optional
  for optional in "$TARGET_DIR/$BB_AVM_BINARY" "$TARGET_DIR/$ACVM_BINARY"; do
    if [ -f "$optional" ]; then
      provided+=" $(basename "$optional")"
    fi
  done
  hash_str \
    $("$ROOT"/barretenberg/cpp/bootstrap.sh hash) \
    $("$ROOT"/noir/bootstrap.sh hash) \
    "$provided"
}

case "$cmd" in
  "clean")
    clean
    ;;
  "ci")
    build
    ;;
  ""|"fast"|"full")
    build
    ;;
  "hash")
    hash
    ;;
  bench|bench_cmds)
    # Empty handling just to make this command valid.
    ;;
  test|test_cmds|test_download)
    ;;
  *)
    default_cmd_handler "$@"
esac

#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
TARGET_DIR=bin
BB_BINARY=bb
NARGO_BINARY=nargo
NOIR_PROFILER_BINARY=noir-profiler

function build_monorepo {
  echo "Setting up labs' aztec toolchain (for the monorepo)..."
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
  ln -sf $bb_full_path "$TARGET_DIR/$BB_BINARY"
  ln -sf $nargo_full_path "$TARGET_DIR/$NARGO_BINARY"
  ln -sf $noir_profiler_full_path "$TARGET_DIR/$NOIR_PROFILER_BINARY"

  echo "Done."
  echo "Created symlink: $bb_full_path -> $TARGET_DIR/$BB_BINARY"
  echo "Created symlink: $nargo_full_path -> $TARGET_DIR/$NARGO_BINARY"
  echo "Created symlink: $noir_profiler_full_path -> $TARGET_DIR/$NOIR_PROFILER_BINARY"
}

function build_labs {
  echo "Setting up labs' aztec toolchain (for the labs repo)..."
  # TODO(fcarreiro): Implement.
  echo_stderr "Not operational yet."
  exit 1
  mkdir -p "$TARGET_DIR"
}

function clean {
  rm -rf $TARGET_DIR
}

function build {
  if [ "${REPO_ORG:-}" = "labs" ]; then
    build_labs
  else
    build_monorepo
  fi
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
    echo_stderr "bb: $(realpath $bb)"
    echo_stderr "nargo: $(realpath $nargo)"
    echo_stderr "noir-profiler: $(realpath $noir_profiler)"
    exit 1
  fi
  hash_str $(git hash-object "$bb" "$nargo" "$noir_profiler")
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

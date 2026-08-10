#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Provisions the binaries the labs components build with (bb, nargo, noir-profiler, and
# optionally bb-avm and acvm) into bin/, from one of two sources:
#
# - Foundation mode (FND_ROOT non-empty): symlink the binaries built inside the checkout at
#   FND_ROOT (barretenberg/cpp and the noir submodule), and derive the toolchain identity
#   from that tree's source hashes. This is the monorepo flow today; after the repo split it
#   is how the foundation repo runs the labs components (as a submodule) against its own tree.
# - Pinned mode (FND_ROOT empty): download released binaries at the versions pinned below,
#   and derive the identity from this directory's committed content. This is the standalone
#   labs repo flow.
#
# The committed default differs per line: the monorepo/foundation side (here) points at its
# own checkout, the labs side commits an empty default. AZTEC_TOOLCHAIN_FND_ROOT overrides
# either default — export it empty to force pinned mode, or set it to a foundation checkout
# root, as the foundation repo does when driving its labs submodule.
FND_ROOT=${AZTEC_TOOLCHAIN_FND_ROOT-$(git rev-parse --show-toplevel)}

TARGET_DIR=bin
BB_BINARY=bb
BB_AVM_BINARY=bb-avm
NARGO_BINARY=nargo
ACVM_BINARY=acvm
NOIR_PROFILER_BINARY=noir-profiler
# Records what was provisioned into TARGET_DIR (written by both build flows).
# Needed because the binaries alone cannot answer "which release is this":
# nargo only reports its base cargo version, never the nightly/release tag.
PIN_FILE=$TARGET_DIR/.pin

# Pinned versions installed in pinned mode (see build_pinned; foundation mode links the
# locally built binaries instead and ignores these). These versions are also hardcoded in
# other files throughout the repo, so a change here requires also updating those.
# check_pin_drift detects any drift between this and those declarations.
# Note that BB is downloaded from the AztecProtocol/barretenberg mirror first (via bbup).
BB_VERSION=6.0.0-nightly.20260807
# NOIR_VERSION must be the noir release the $BB_VERSION aztec-packages release was built
# against (its noir submodule): the pinned nargo's output is consumed by tools from that
# release (bb, and the @aztec/noir-* js packages, which are that submodule republished).
# Skew is not detected by check_pin_drift, it surfaces in other places (e.g. the docs
# examples' runtime tests).
NOIR_VERSION=1.0.0-beta.26

# The installers and sources are fetched at build time; overridable for testing/mirroring.
BBUP_URL=${BBUP_URL:-https://raw.githubusercontent.com/AztecProtocol/aztec-packages/86f69c8751f63ca604a1dab5967f208b211a1611/barretenberg/bbup/bbup}
NOIRUP_URL=${NOIRUP_URL:-https://raw.githubusercontent.com/noir-lang/noirup/324a51fca2c410d2477400316efc5ce0d743a5b3/noirup}
# bbup's artifact name is hardcoded to the plain bb, so the AVM-enabled build is taken
# straight from the release. The URLs are tried in order: the barretenberg mirror, which
# bb is also published to first, then aztec-packages.
# Empty on a machine ci3/arch does not recognize, which makes bb_avm_released_here skip bb-avm.
# Letting arch fail here would abort every command this script offers instead, including the nargo
# and acvm installs that have nothing to do with bb-avm.
BB_AVM_ARCH=$(arch 2>/dev/null || true)
BB_AVM_ARTIFACT=barretenberg-avm-$BB_AVM_ARCH-linux.tar.gz
BB_AVM_URLS=${BB_AVM_URLS:-"
  https://github.com/AztecProtocol/barretenberg/releases/download/v$BB_VERSION/$BB_AVM_ARTIFACT
  https://github.com/AztecProtocol/aztec-packages/releases/download/v$BB_VERSION/$BB_AVM_ARTIFACT
"}
# No noir release ships acvm and acvm_cli is not published to crates.io, so it is compiled
# from the release source tree. Noir tags releases "v<semver>" and nightlies unprefixed.
NOIR_TAG=$NOIR_VERSION
[[ $NOIR_TAG == nightly-* ]] || NOIR_TAG=v$NOIR_TAG
NOIR_SOURCE_URL=${NOIR_SOURCE_URL:-https://github.com/noir-lang/noir/archive/refs/tags/$NOIR_TAG.tar.gz}

function link_tool {
  local full_path=$1
  local name=$2
  # The link must be relative: the checkout gets mounted at other paths (e.g. the aztec-up test
  # container bind-mounts it at /home/ubuntu/aztec-packages), where an absolute target dangles.
  ln -sf "$(realpath --relative-to="$TARGET_DIR" "$full_path")" "$TARGET_DIR/$name"
  echo "Created symlink: $TARGET_DIR/$name -> $full_path"
}

function check_fnd_root {
  if [ ! -f "$FND_ROOT/barretenberg/cpp/bootstrap.sh" ] || [ ! -f "$FND_ROOT/noir/bootstrap.sh" ]; then
    echo_stderr "AZTEC_TOOLCHAIN_FND_ROOT does not point at a foundation checkout (no barretenberg/cpp and noir): $FND_ROOT"
    exit 1
  fi
}

function build_fnd {
  echo "Setting up labs' aztec toolchain from $FND_ROOT..."
  check_fnd_root

  local bb_full_path="$FND_ROOT/barretenberg/cpp/build/bin/$BB_BINARY"
  local nargo_full_path="$FND_ROOT/noir/noir-repo/target/release/$NARGO_BINARY"
  local noir_profiler_full_path="$FND_ROOT/noir/noir-repo/target/release/$NOIR_PROFILER_BINARY"

  if [ ! -f $bb_full_path ] || [ ! -f $nargo_full_path ] || [ ! -f $noir_profiler_full_path ]; then
    echo_stderr "Required binaries not found, exiting."
    echo_stderr "bb: $bb_full_path"
    echo_stderr "nargo: $nargo_full_path"
    echo_stderr "noir-profiler: $noir_profiler_full_path"
    exit 1
  fi

  # Start from an empty TARGET_DIR: a previous pinned-mode provisioning leaves real binaries
  # (and a pin record attesting them) that the symlinks below must fully replace.
  clean
  mkdir -p "$TARGET_DIR"
  link_tool "$bb_full_path" "$BB_BINARY"
  link_tool "$nargo_full_path" "$NARGO_BINARY"
  link_tool "$noir_profiler_full_path" "$NOIR_PROFILER_BINARY"

  # These may legitimately be absent: bb-avm is skipped by AVM=0 builds, and noir releases
  # don't ship acvm (the noir-from-release flow). Link whatever exists; a consumer of an
  # absent binary fails at the point of use.
  local optional_path
  for optional_path in \
    "$FND_ROOT/barretenberg/cpp/build/bin/$BB_AVM_BINARY" \
    "$FND_ROOT/noir/noir-repo/target/release/$ACVM_BINARY"; do
    if [ -f "$optional_path" ]; then
      link_tool "$optional_path" "$(basename "$optional_path")"
    fi
  done

  # Record the full noir version: the exact tag when the submodule sits on one,
  # otherwise the binary's base version (a bare commit is not installable, so
  # it is not a useful record). Tags may be missing in shallow CI checkouts.
  git -C "$FND_ROOT/noir/noir-repo" fetch --tags --quiet 2>/dev/null || true
  local noir_full_version
  if ! noir_full_version=$(git -C "$FND_ROOT/noir/noir-repo" describe --tags --exact-match HEAD 2>/dev/null); then
    noir_full_version=$("$nargo_full_path" --version | sed -n 's/^nargo version = //p')
  fi
  {
    echo "bb=local"
    echo "noir=$noir_full_version"
  } > "$PIN_FILE"

  echo "Done."
}

# The pin record ties the provisioned binaries to the pinned versions AND their
# content hashes: matching versions alone would not detect corrupted or swapped
# binaries in TARGET_DIR. Hashes are recorded per binary and only for those
# present, so the absence of an optional binary is part of the record too.
function labs_pin_record {
  echo "bb=$BB_VERSION"
  echo "noir=$NOIR_VERSION"
  local name
  for name in "$BB_BINARY" "$BB_AVM_BINARY" "$NARGO_BINARY" "$NOIR_PROFILER_BINARY" "$ACVM_BINARY"; do
    if [ -f "$TARGET_DIR/$name" ]; then
      echo "${name}_hash=$(git hash-object "$TARGET_DIR/$name")"
    fi
  done
}

# Reads a key from the pin record; empty when the record or the key is absent.
function pin_value {
  sed -n "s/^$1=//p" "$PIN_FILE" 2>/dev/null
}

# A binary is current when it exists, was provisioned from the release we pin now, and
# still hashes to what was recorded. A missing file, a moved pin, and a content mismatch
# (corruption, manual overwrite, a foundation-mode symlink) all mean it has to be fetched
# again.
function is_current {
  local name=$1 release_key=$2 pinned_version=$3
  local file=$TARGET_DIR/$name
  [ -f "$file" ] &&
    [ "$(pin_value "$release_key")" = "$pinned_version" ] &&
    [ "$(pin_value "${name}_hash")" = "$(git hash-object "$file")" ]
}

# Drops a binary that cannot be provisioned on this machine. Whatever put it there (a
# foundation-mode symlink, a manual copy) is unrelated to what this flow installs, and
# keeping it would leave the record attesting contents from a different provisioning.
function drop_unprovisionable {
  if [ -e "$TARGET_DIR/$1" ]; then
    echo "Removing $1: cannot be provisioned here, and unrelated to what was just installed."
    rm -f "$TARGET_DIR/$1"
  fi
}

function install_bb {
  local tmp=$1
  echo "Installing $BB_BINARY $BB_VERSION via bbup..."
  curl -fsSL "$BBUP_URL" -o "$tmp/bbup"
  chmod +x "$tmp/bbup"
  rm -f "$TARGET_DIR/$BB_BINARY" # Remove the destination first.
  BB_PATH="$PWD/$TARGET_DIR" "$tmp/bbup" -v "$BB_VERSION" --no-modify-path
}

# bb-avm is released for linux only, see build_release_dir in barretenberg/cpp/bootstrap.sh.
function bb_avm_released_here {
  [ "$(os)" = linux ] && [ -n "$BB_AVM_ARCH" ]
}

function install_bb_avm {
  local tmp=$1
  local archive=$tmp/$BB_AVM_ARTIFACT
  echo "Installing $BB_AVM_BINARY $BB_VERSION from release..."
  local url found=false
  for url in $BB_AVM_URLS; do
    if curl -fsSL "$url" -o "$archive"; then
      found=true
      break
    fi
    echo "Not available at $url."
  done
  if ! $found; then
    echo_stderr "Could not download $BB_AVM_ARTIFACT for v$BB_VERSION from any known release URL."
    exit 1
  fi
  rm -f "$TARGET_DIR/$BB_AVM_BINARY" # Remove the destination first.
  tar xzf "$archive" -C "$TARGET_DIR" "$BB_AVM_BINARY"
}

function install_noir {
  local tmp=$1
  echo "Installing $NARGO_BINARY/$NOIR_PROFILER_BINARY $NOIR_VERSION via noirup..."
  curl -fsSL "$NOIRUP_URL" -o "$tmp/noirup"
  chmod +x "$tmp/noirup"
  mkdir -p "$tmp/nargo_home/bin"
  NARGO_HOME="$tmp/nargo_home" "$tmp/noirup" -v "$NOIR_VERSION"
  rm -f "$TARGET_DIR/$NARGO_BINARY" "$TARGET_DIR/$NOIR_PROFILER_BINARY" # Remove the destinations first.
  cp -f "$tmp/nargo_home/bin/$NARGO_BINARY" "$TARGET_DIR/$NARGO_BINARY"
  cp -f "$tmp/nargo_home/bin/$NOIR_PROFILER_BINARY" "$TARGET_DIR/$NOIR_PROFILER_BINARY"
}

function install_acvm {
  local tmp=$1
  local src=$tmp/noir
  local cargo_home=$tmp/cargo-home
  local cargo_root=$tmp/cargo-root
  # The key carries the platform because this is a compiled binary; keys derived from
  # cache_content_hash get that for free, this one is just the pinned version.
  local cache_key=labs-acvm-$NOIR_VERSION-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m).zst

  rm -f "$TARGET_DIR/$ACVM_BINARY" # Remove the destination first.

  # A build from scratch takes ~5 minutes: ~1.5 of compiling, the rest fetching the ~330
  # dependency crates, which the isolated CARGO_HOME below means paying again every time.
  # Nothing but the pinned noir version and the platform goes into the result (the build is
  # byte-reproducible, see the path remapping below), so a cached binary is as good as a
  # fresh one, down to the hash the pin records.
  if cache_download "$cache_key"; then
    echo "Restored $ACVM_BINARY $NOIR_VERSION from the build cache."
    return
  fi

  echo "Building $ACVM_BINARY $NOIR_VERSION from source (no release ships it)..."
  mkdir -p "$src"
  curl -fsSL "$NOIR_SOURCE_URL" | tar xz -C "$src" --strip-components=1

  # Materialise the toolchain before building. rustup installs a missing channel into the
  # shared RUSTUP_HOME, which the isolated CARGO_HOME below does not cover, and two units
  # installing the same channel at once make one roll back the other's install, leaving a
  # toolchain with no cargo in it. This is the lock the repo's other cargo builds take; hold
  # it only for the install, so the compile itself still runs alongside them.
  (
    flock -x 200
    cd "$src" && cargo --version >/dev/null
  ) 200>/tmp/rustup.lock

  # Every path cargo writes to lives under $tmp, so the trap that removes $tmp removes the
  # entire build: CARGO_HOME keeps the fetched crates out of the user's registry cache,
  # --root keeps the binary and its install manifest out of ~/.cargo/bin, and
  # CARGO_TARGET_DIR keeps the object files out of the source tree.
  # The paths are remapped out of the binary because the pin records acvm's content hash
  # and that hash feeds downstream cache keys: left in, $tmp's random name would make
  # every build of the same source produce different bytes.
  # GIT_COMMIT/GIT_DIRTY are what noirc_driver's build script would otherwise read from a
  # git checkout, which a release tarball is not.
  # Cargo runs from inside the source tree so rustup picks up noir's rust-toolchain.toml:
  # the workspace pins an MSRV newer than the cargo many machines have on PATH, and from
  # anywhere else the build dies on a version mismatch instead.
  (
    cd "$src"
    CARGO_HOME=$cargo_home \
    CARGO_TARGET_DIR=$tmp/cargo-target \
    RUSTFLAGS="--remap-path-prefix=$src=/noir --remap-path-prefix=$cargo_home=/cargo" \
    GIT_COMMIT=$NOIR_TAG \
    GIT_DIRTY=false \
    SOURCE_DATE_EPOCH=0 \
      cargo install --locked --path tooling/acvm_cli --root "$cargo_root"
  )

  cp -f "$cargo_root/bin/$ACVM_BINARY" "$TARGET_DIR/$ACVM_BINARY"
  cache_upload "$cache_key" "$TARGET_DIR/$ACVM_BINARY"
}

function build_pinned {
  echo "Setting up labs' aztec toolchain..."
  echo "Pinned versions: bb $BB_VERSION, noir $NOIR_VERSION"

  mkdir -p "$TARGET_DIR"

  # Every binary is checked on its own, but the flows that provision them are coarser:
  # bbup and noirup each install their whole release in one shot, so a stale nargo also
  # refetches noir-profiler, while bb-avm (its own release artifact) and acvm (a source
  # build) are provisioned individually.
  local fetch_bb=false fetch_bb_avm=false fetch_noir=false fetch_acvm=false
  is_current "$BB_BINARY" bb "$BB_VERSION" || fetch_bb=true
  is_current "$BB_AVM_BINARY" bb "$BB_VERSION" || fetch_bb_avm=true
  is_current "$NARGO_BINARY" noir "$NOIR_VERSION" || fetch_noir=true
  is_current "$NOIR_PROFILER_BINARY" noir "$NOIR_VERSION" || fetch_noir=true
  is_current "$ACVM_BINARY" noir "$NOIR_VERSION" || fetch_acvm=true

  if ! $fetch_bb && ! $fetch_bb_avm && ! $fetch_noir && ! $fetch_acvm; then
    echo "Toolchain matches pinned versions and hashes, nothing to download."
    return
  fi

  local tmp=$(mktemp -d)
  trap "rm -rf $tmp" EXIT

  if $fetch_bb; then
    install_bb "$tmp"
  else
    echo "$BB_BINARY $BB_VERSION already provisioned."
  fi

  if $fetch_bb_avm; then
    if bb_avm_released_here; then
      install_bb_avm "$tmp"
    else
      # Absence is tolerated: its consumers (AVM proving) only run on linux anyway.
      echo "Skipping $BB_AVM_BINARY: released for linux amd64/arm64 only (this is $(os)/$(uname -m))."
      drop_unprovisionable "$BB_AVM_BINARY"
    fi
  else
    echo "$BB_AVM_BINARY $BB_VERSION already provisioned."
  fi

  if $fetch_noir; then
    install_noir "$tmp"
  else
    echo "$NARGO_BINARY/$NOIR_PROFILER_BINARY $NOIR_VERSION already provisioned."
  fi

  # The record is written before the acvm build, the one step that takes minutes and can
  # fail on its own (it compiles noir), so a failure there does not cost the downloads that
  # already succeeded. A stale acvm goes first: the record hashes what is on disk, and an
  # interrupted run must not leave it attesting contents that are about to be replaced.
  if $fetch_acvm; then
    rm -f "$TARGET_DIR/$ACVM_BINARY"
  fi
  labs_pin_record > "$PIN_FILE"

  if $fetch_acvm; then
    if command -v cargo &>/dev/null; then
      install_acvm "$tmp"
    else
      # Absence is tolerated: acvm's consumers fall back to the wasm simulator without it.
      echo "Skipping $ACVM_BINARY: it has to be built and cargo is not installed."
      drop_unprovisionable "$ACVM_BINARY"
    fi
  else
    echo "$ACVM_BINARY $NOIR_VERSION already provisioned."
  fi

  labs_pin_record > "$PIN_FILE"
  echo "Done."
}

function clean {
  rm -rf $TARGET_DIR
}

# The pinned versions above are also written out in files that consume the release
# directly and cannot read them from here. This asserts they all match BB_VERSION
# so a pin bump cannot leave one behind.
function check_pin_drift {
  local repo_root=$(git rev-parse --show-toplevel)
  local failed=false

  local hit tag
  while IFS= read -r hit; do
    tag=$(sed -n 's/.*tag *= *"\([^"]*\)".*/\1/p' <<< "${hit#*:*:}")
    if [ "$tag" != "v$BB_VERSION" ]; then
      echo_stderr "${hit%%:*}:$(cut -d: -f2 <<< "$hit"): aztec-packages git dep pins tag \"$tag\", expected \"v$BB_VERSION\" (BB_VERSION in labs-aztec-toolchain/bootstrap.sh)."
      failed=true
    fi
  done < <(git -C "$repo_root" grep -n 'github.com/AztecProtocol/aztec-packages' -- '*Nargo.toml' || true)

  local config=$repo_root/docs/examples/ts/recursive_verification/config.yaml
  local pin version
  while IFS= read -r pin; do
    version=${pin##*@}
    if [ "$version" != "$BB_VERSION" ]; then
      echo_stderr "$config: \"$pin\" pins version \"$version\", expected \"$BB_VERSION\" (BB_VERSION in labs-aztec-toolchain/bootstrap.sh)."
      failed=true
    fi
  # Only bb.js and the noir packages track BB_VERSION: other @aztec-scoped pins
  # (e.g. the viem fork) version independently and must not be checked.
  done < <(grep -oE 'npm:@aztec/(bb\.js|noir-[^@"]*)@[^"]*' "$config" 2>/dev/null || true)

  # docs pins the l1-artifacts package, whose l1-contracts sources feed the docs
  # L1 snippets and the solidity examples' imports.
  local pkg_json=$repo_root/docs/package.json
  version=$(sed -n 's/.*"@aztec\/l1-artifacts": *"\([^"]*\)".*/\1/p' "$pkg_json")
  if [ "$version" != "$BB_VERSION" ]; then
    echo_stderr "$pkg_json: @aztec/l1-artifacts pins version \"$version\", expected \"$BB_VERSION\" (BB_VERSION in labs-aztec-toolchain/bootstrap.sh)."
    failed=true
  fi

  # yarn-project pins its first-party npm dependencies in one place, the resolutions block; the
  # workspace manifests carry a dummy version. Every @aztec-scoped entry there is a release of this
  # repo and so tracks BB_VERSION, unlike the third-party entries it sits beside.
  local manifest=$repo_root/yarn-project/package.json
  local pkg
  while IFS=$'\t' read -r pkg version; do
    if [ "$version" != "$BB_VERSION" ]; then
      echo_stderr "$manifest: \"$pkg\" pins version \"$version\", expected \"$BB_VERSION\" (BB_VERSION in labs-aztec-toolchain/bootstrap.sh)."
      failed=true
    fi
  done < <(jq -r '.resolutions | to_entries[] | select(.key | startswith("@aztec/")) | "\(.key)\t\(.value)"' "$manifest")

  if $failed; then
    echo_stderr "Pinned release versions drifted - align them with BB_VERSION."
    exit 1
  fi
}

function build {
  if [ -n "$FND_ROOT" ]; then
    build_fnd
  else
    check_pin_drift
    build_pinned
  fi
}

# The full noir version (e.g. "1.0.0-beta.26" or "nightly-2026-06-02"), read from the pin
# record: the binary only reports its base cargo version, which cannot distinguish a
# nightly from the release it was cut from. Falls back to the binary when no record exists
# (a bin/ provisioned before the record was introduced).
function noir_version {
  local pinned=$(pin_value noir)
  if [ -n "$pinned" ]; then
    echo "${pinned#v}"
    return
  fi
  local nargo="$TARGET_DIR/$NARGO_BINARY"
  if [ ! -f "$nargo" ]; then
    echo_stderr "Cannot get noir version, no pin record at $PIN_FILE and no nargo (build first)."
    exit 1
  fi
  "$nargo" --version | sed -n 's/^nargo version = //p'
}

function hash {
  if [ -n "$FND_ROOT" ]; then
    check_fnd_root
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
    # whether the binaries themselves rebuild.
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
      $("$FND_ROOT"/barretenberg/cpp/bootstrap.sh hash) \
      $("$FND_ROOT"/noir/bootstrap.sh hash) \
      "$provided"
  else
    # Pinned mode: the identity is this directory's committed content — the pins name
    # immutable releases and the provisioning logic decides what lands in bin/, so together
    # they determine the toolchain without reading a single provisioned byte. That keeps the
    # hash computable on a fresh checkout (before any build), commit-independent, and immune
    # to a corrupted bin/ minting a fresh valid-looking cache key; byte verification against
    # the pins happens at provision time instead (see labs_pin_record/is_current).
    # cache_content_hash mixes in the platform tag, and dirty toolchain files must disable
    # caching rather than being laundered into a stable-looking key.
    local content_hash=$(cache_content_hash "^labs-aztec-toolchain/")
    if [ "$content_hash" == "disabled-cache" ]; then
      echo disabled-cache
      return
    fi
    # Mirror foundation mode: what the toolchain provides on this machine (including an
    # optional binary's absence) is part of its identity. Both facts are known without
    # provisioning: bb-avm is released for linux only, and acvm is compiled locally so it
    # exists exactly where cargo does.
    local expected=""
    if bb_avm_released_here; then
      expected+=" $BB_AVM_BINARY"
    fi
    if command -v cargo &>/dev/null; then
      expected+=" $ACVM_BINARY"
    fi
    hash_str "$content_hash" "$expected"
  fi
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

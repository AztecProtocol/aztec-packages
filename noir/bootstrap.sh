#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

set -eou pipefail

noir_commit=$(git -C noir-repo rev-parse HEAD)
export hash=$(hash_str $noir_commit $(cache_content_hash .rebuild_patterns))

# Must be in dependency order for releasing.
export js_projects="
  types
  noir_js
  noir_codegen
  noirc_abi
  acvm_js
"
export js_include=$(printf " --include @noir-lang/%s" $js_projects)

export GIT_COMMIT=$noir_commit
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false

# Local dev opt-in: when a `noir-from-release.flag` file exists at the repo root and the pinned
# noir-repo commit is exactly an official noir release, fetch the released binaries with noirup
# instead of compiling nargo from source (a ~10 minute build). Returns 0 when the released
# binaries were installed, 1 to fall back to a source build (e.g. the commit is unreleased dev work).
function install_native_from_release {
  set -uo pipefail

  if [[ ! -f "$root/noir-from-release.flag" ]]; then
    return 1
  fi

  # The exact-match lookup needs tags, which a shallow CI checkout omits; harmless if already present.
  git -C noir-repo fetch --tags --quiet 2>/dev/null || true

  local tag
  if ! tag=$(git -C noir-repo describe --tags --exact-match HEAD 2>/dev/null); then
    echo_stderr "noir-from-release.flag set but noir-repo HEAD ($noir_commit) is not an official release tag; building from source."
    return 1
  fi

  local release_dir=noir-repo/target/release
  local version=${tag#v}

  # Cached locally: if a previous run already placed the matching release nargo, reuse it.
  if [[ -x "$release_dir/nargo" ]] && "$release_dir/nargo" --version 2>/dev/null | grep -q "nargo version = $version\b"; then
    echo "noir-from-release.flag set; reusing cached nargo $version from release $tag."
    return 0
  fi

  # Guard with our build cache before reaching out to GitHub. This key (noir-$hash, derived from the
  # noir commit) is the same one CI populates from the source build, so a GitHub outage or a missing
  # release asset can't block the build when the artifact is already cached.
  if cache_download noir-$hash.tar.gz && [[ -x "$release_dir/nargo" ]]; then
    echo "noir-from-release.flag set; restored nargo for $tag from the build cache (skipped GitHub)."
    return 0
  fi

  echo "noir-from-release.flag set and noir-repo is at release $tag; fetching released binaries via noirup."

  # Install noirup and the pinned release into an isolated NARGO_HOME so we don't touch ~/.nargo.
  local nargo_home=$PWD/noir-repo/target/.noirup
  rm -rf "$nargo_home"
  mkdir -p "$nargo_home/bin"

  if ! curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/noir-lang/noirup/main/noirup -o "$nargo_home/noirup"; then
    echo_stderr "Failed to download noirup; building from source."
    return 1
  fi
  chmod +x "$nargo_home/noirup"

  if ! NARGO_HOME=$nargo_home "$nargo_home/noirup" -v "$tag"; then
    echo_stderr "noirup failed to install release $tag; building from source."
    return 1
  fi

  # Place whatever noirup installed where the rest of the build expects it. The release ships nargo
  # (and noir-profiler), but not noir-execute; its consumers fall back to the WASM simulator when
  # absent.
  mkdir -p "$release_dir"
  local bin
  for bin in nargo noir-execute noir-profiler; do
    if [[ -f "$nargo_home/bin/$bin" ]]; then
      cp -f "$nargo_home/bin/$bin" "$release_dir/$bin"
    fi
  done

  if [[ ! -x "$release_dir/nargo" ]]; then
    echo_stderr "noirup did not produce a nargo binary for $tag; building from source."
    return 1
  fi

  echo "Installed nargo $("$release_dir/nargo" --version | head -1) from release $tag."
}

# Builds the nargo, noir-execute and profiler binaries.
function build_native {
  set -euo pipefail

  if install_native_from_release; then
    return
  fi

  if ! cache_download noir-$hash.tar.gz; then
    # Serialize cargo operations to avoid race conditions with avm-transpiler
    # which may run in parallel and share the same CARGO_HOME.
    (
      flock -x 200
      cd noir-repo && cargo build --locked --release --target-dir target
    ) 200>/tmp/rustup.lock
    # noir-execute comes out of the same workspace build (tooling/artifact_cli is a
    # default-member) and labs-aztec-toolchain symlinks it for native protocol-circuit
    # execution, so it has to survive a cache round trip like the rest. The build also produces
    # acvm, which nothing consumes since the labs node moved to noir-execute; it is left behind.
    cache_upload noir-$hash.tar.gz noir-repo/target/release/{nargo,noir-execute,noir-profiler}
  fi
}

# Builds js packages.
function build_packages {
  set -euo pipefail

  # Workaround to not need to install wasm-opt.
  # It's cursed, llvm will use it without permission if it finds it in PATH.
  export PATH=$PWD/scripts:$PATH

  if cache_download noir-packages-$hash.tar.gz; then
    cd noir-repo
    npm_install_deps
    return
  fi

  cd noir-repo
  npm_install_deps

  yarn workspaces foreach -A --parallel --topological-dev --verbose $js_include run build

  # We create a folder called packages, that contains each package as it would be published to npm, named correctly.
  # These can be useful for testing, or to portal into other projects.
  yarn workspaces foreach -A --parallel $js_include pack

  cd ..
  rm -rf packages && mkdir -p packages
  for project in $js_projects; do
    p=$(cd noir-repo && yarn workspaces list --json | jq -r "select(.name==\"@noir-lang/$project\").location")
    tar zxfv noir-repo/$p/package.tgz -C packages
    mv packages/package packages/$project
  done

  # Find all files in packages dir and use sed to in-place replace @noir-lang with @aztec-foundation/noir-
  find packages -type f -exec sed -i 's|@noir-lang/|@aztec-foundation/noir-|g' {} \;

  cache_upload noir-packages-$hash.tar.gz \
    packages \
    noir-repo/acvm-repo/acvm_js/nodejs \
    noir-repo/acvm-repo/acvm_js/web \
    noir-repo/tooling/noir_codegen/lib \
    noir-repo/tooling/noir_js/lib \
    noir-repo/tooling/noir_js_types/lib \
    noir-repo/tooling/noirc_abi_wasm/nodejs \
    noir-repo/tooling/noirc_abi_wasm/web
}

function install_deps {
  set -euo pipefail
  # Serialize rustup/cargo-binstall operations to avoid race conditions with avm-transpiler
  # which may run in parallel and share the same RUSTUP_HOME/CARGO_HOME.
  (
    flock -x 200
    if ! command -v cargo-binstall &>/dev/null; then
      curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
    fi
    if ! command -v just &>/dev/null; then
      cargo-binstall just --version 1.42.4 -y --secure
    fi
    just --justfile ./noir-repo/justfile install-rust-tools
    just --justfile ./noir-repo/justfile install-js-tools
  ) 200>/tmp/rustup.lock
}

export -f install_native_from_release build_native build_packages install_deps

function build {
  echo_header "noir build"

  if semver check $REF_NAME; then
    # REF_NAME matches semver meaning we are doing a release

    git -C noir-repo fetch --tags
    if ! git -C noir-repo describe --tags --exact-match HEAD &>/dev/null; then
      echo_stderr "We're building a release but the noir-repo HEAD is not an official release."
      exit 1
    fi

    # Check that the noir release has nargo binaries available for download. Without this check, we could push an aztec
    # release that errors out with a 404/gzip error on install (the install scripts invoke noirup which would fail).
    local noir_tag=$(git -C noir-repo describe --tags --exact-match HEAD)
    echo "Checking noir release $noir_tag for nargo binary assets..."
    local asset_count
    asset_count=$(gh release view "$noir_tag" \
      --repo noir-lang/noir \
      --json assets \
      --jq '[.assets[] | select(.name | test("^nargo-"))] | length') || {
      echo_stderr "Error: Failed to query noir-lang/noir release '$noir_tag'. Does the release exist?"
      exit 1
    }
    if [ "$asset_count" -eq 0 ]; then
      echo_stderr "Error: Noir release '$noir_tag' exists but has no nargo binary assets."
      echo_stderr "Users will get 404 errors when trying to install nargo via noirup."
      echo_stderr "Ensure the noir release pipeline has finished uploading binaries before releasing aztec-packages."
      exit 1
    fi
    echo "Found $asset_count nargo binary asset(s) in noir release $noir_tag."
  fi

  denoise "retry install_deps"
  parallel --tag --line-buffer --halt now,fail=1 denoise ::: build_native build_packages
}

function get_projects {
  for dir in $js_projects; do
    realpath packages/$dir
  done
}

function release {
  local version=${REF_NAME#v}
  cd packages

  for dir in $js_projects; do
    [ ! -d "$dir" ] && echo "Project path not found: $dir" && exit 1
    cd $dir

    jq --arg v $version '.version = $v' package.json >tmp.json
    mv tmp.json package.json

    retry "deploy_npm $version"
    cd ..
  done
}

case "$cmd" in
  "clean")
    # Double `f` needed to delete the nested git repository.
    git clean -ffdx
    ;;
  "")
    build
    ;;
  "hash")
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac

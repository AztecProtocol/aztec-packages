#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

set -eou pipefail

noir_commit=$(git -C noir-repo rev-parse HEAD)
export hash=$(hash_str $noir_commit $(cache_content_hash .rebuild_patterns))

# Must be in dependency order for releasing.
export js_projects="
  @noir-lang/types
  @noir-lang/noir_js
  @noir-lang/noir_codegen
  @noir-lang/noirc_abi
  @noir-lang/acvm_js
"
export js_include=$(printf " --include %s" $js_projects)

export GIT_COMMIT=$noir_commit
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false
export RUSTFLAGS="-Dwarnings"

# Builds nargo, acvm and profiler binaries.
function build_native {
  set -euo pipefail

  if ! cache_download noir-$hash.tar.gz; then
    (cd noir-repo && cargo build --locked --release --target-dir target)
    cache_upload noir-$hash.tar.gz noir-repo/target/release/{nargo,acvm,noir-profiler}
  fi
}

# Builds js packages.
function build_packages {
  set -euo pipefail

  if cache_download noir-packages-$hash.tar.gz; then
    cd noir-repo
    npm_install_deps
    return
  fi

  cd noir-repo
  npm_install_deps

  yarn workspaces foreach  -A --parallel --topological-dev --verbose $js_include run build

  # We create a folder called packages, that contains each package as it would be published to npm, named correctly.
  # These can be useful for testing, or to portal into other projects.
  yarn workspaces foreach  -A --parallel $js_include pack

  cd ..
  rm -rf packages && mkdir -p packages
  for project in $js_projects; do
    p=$(cd noir-repo && yarn workspaces list --json | jq -r "select(.name==\"$project\").location")
    tar zxfv noir-repo/$p/package.tgz -C packages
    mv packages/package packages/${project#*/}
  done

  # Find all files in packages dir and use sed to in-place replace @noir-lang with @aztec/noir-
  find packages -type f -exec sed -i 's|@noir-lang/|@aztec/noir-|g' {} \;

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
  # TODO: Move to build image?
  if ! command -v cargo-binstall &>/dev/null; then
    curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
  fi
  if ! command -v just &>/dev/null; then
    cargo-binstall just --version 1.42.4 -y --secure
  fi
  just --justfile ./noir-repo/justfile install-rust-tools
  just --justfile ./noir-repo/justfile install-js-tools
}

export -f build_native build_packages install_deps

function build {
  echo_header "noir build"

  if semver check $REF_NAME; then
    git -C noir-repo fetch --tags
    if ! git -C noir-repo describe --tags --exact-match HEAD &>/dev/null; then
      echo_stderr "We're building a release but the noir-repo HEAD is not an official release."
      exit 1
    fi
  fi

  denoise "retry install_deps"
  parallel --tag --line-buffer --halt now,fail=1 denoise ::: build_native build_packages
}

function release {
  local dist_tag=$(dist_tag)
  local version=${REF_NAME#v}
  cd packages

  for package in $js_projects; do
    local dir=${package#*/}
    [ ! -d "$dir" ] && echo "Project path not found: $dir" && exit 1
    cd $dir

    jq --arg v $version '.version = $v' package.json >tmp.json
    mv tmp.json package.json

    retry "deploy_npm $dist_tag $version"
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

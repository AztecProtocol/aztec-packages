#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

set -eou pipefail

cmd=${1:-}
[ -n "$cmd" ] && shift

# export js_projects="
#   @noir-lang/types
#   @noir-lang/noir_js
#   @noir-lang/noir_codegen
#   @noir-lang/noirc_abi
#   @noir-lang/acvm_js
# "
# export js_include=$(printf " --include %s" $js_projects)

# function hash {
#   cache_content_hash ./.rebuild_patterns)
# }

# # Builds nargo, acvm and profiler binaries.
# function build_native {
#   set -euo pipefail
#   local hash=$(hash)

#   if ! dpkg -l pkg-config libssl-dev >/dev/null 2>&1; then
#     sudo apt update && sudo apt install -y pkg-config libssl-dev
#   fi

#   if cache_download noir-$hash.tar.gz; then
#     return
#   fi

#   cd noir-repo
#   parallel --tag --line-buffer --halt now,fail=1 ::: \
#     "cargo fmt --all --check" \
#     "cargo build --locked --release --target-dir target" \
#     "cargo clippy --target-dir target/clippy --workspace --locked --release"
#   cd ..
#   cache_upload noir-$hash.tar.gz noir-repo/target/release/{nargo,acvm,noir-profiler}
# }

# # Builds js packages.
# function build_packages {
#   set -euo pipefail
#   local hash=$(hash)

#   if cache_download noir-packages-$hash.tar.gz; then
#     cd noir-repo
#     npm_install_deps
#     return
#   fi

#   cd noir-repo
#   npm_install_deps

#   yarn workspaces foreach  -A --parallel --topological-dev --verbose $js_include run build

#   # We create a folder called packages, that contains each package as it would be published to npm, named correctly.
#   # These can be useful for testing, or to portal into other projects.
#   yarn workspaces foreach  -A --parallel $js_include pack

#   cd ..
#   rm -rf packages && mkdir -p packages
#   for project in $js_projects; do
#     p=$(cd noir-repo && yarn workspaces list --json | jq -r "select(.name==\"$project\").location")
#     tar zxfv noir-repo/$p/package.tgz -C packages
#     mv packages/package packages/${project#*/}
#   done

#   # Find all files in packages dir and use sed to in-place replace @noir-lang with @aztec/noir-
#   find packages -type f -exec sed -i 's|@noir-lang/|@aztec/noir-|g' {} \;

#   cache_upload noir-packages-$hash.tar.gz \
#     packages \
#     noir-repo/acvm-repo/acvm_js/nodejs \
#     noir-repo/acvm-repo/acvm_js/web \
#     noir-repo/tooling/noir_codegen/lib \
#     noir-repo/tooling/noir_js/lib \
#     noir-repo/tooling/noir_js_types/lib \
#     noir-repo/tooling/noirc_abi_wasm/nodejs \
#     noir-repo/tooling/noirc_abi_wasm/web
# }

# function install_deps {
#   set -euo pipefail
#   # TODO: Move to build image?
#   if ! command -v cargo-binstall &>/dev/null; then
#     curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
#   fi
#   if ! command -v just &>/dev/null; then
#     cargo-binstall just --version 1.42.4 -y --secure
#   fi
#   just --justfile ./noir-repo/justfile install-rust-tools
#   just --justfile ./noir-repo/justfile install-js-tools
# }

# export -f build_native build_packages noir_content_hash install_deps

function build {
  echo_header "noir install"
  if ! command noirup &>/dev/null; then
    curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
  fi
  # TODO: If we want local edits, we should be able to point this at a fork repo and use -r flag to install.
  $HOME/.nargo/bin/noirup -v $(cat ./noir-repo-ref)
  # For backwards compatability, link noirup installed noir to noir-repo.
  mkdir -p noir-repo/target/release
  ln -sf $HOME/.nargo/bin/nargo noir-repo/target/release/nargo
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "hash")
    nargo --version | sed -n 's/(git version hash: \([^,]*\).*/\1/p'
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac

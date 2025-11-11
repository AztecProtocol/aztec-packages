#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

set -eou pipefail

cmd=${1:-}
[ -n "$cmd" ] && shift

export js_projects="
  @noir-lang/types
  @noir-lang/noir_js
  @noir-lang/noir_codegen
  @noir-lang/noirc_abi
  @noir-lang/acvm_js
"
export js_include=$(printf " --include %s" $js_projects)

# Builds TypeScript packages from local noir-repo clone (unhappy path).
function build_packages {
  set -euo pipefail

  cd noir-repo
  npm_install_deps

  yarn workspaces foreach -A --parallel --topological-dev --verbose $js_include run build

  # We create a folder called packages, that contains each package as it would be published to npm, named correctly.
  # These can be useful for testing, or to portal into other projects.
  yarn workspaces foreach -A --parallel $js_include pack

  cd ..
  rm -rf packages && mkdir -p packages
  for project in $js_projects; do
    p=$(cd noir-repo && yarn workspaces list --json | jq -r "select(.name==\"$project\").location")
    tar zxfv noir-repo/$p/package.tgz -C packages
    mv packages/package packages/${project#*/}
  done

  # Find all files in packages dir and use sed to in-place replace @noir-lang with @aztec/noir-
  find packages -type f -exec sed -i 's|@noir-lang/|@aztec/noir-|g' {} \;
}

# Creates forwarding packages that re-export official npm packages (happy path).
function setup_forwarding_packages {
  set -euo pipefail
  local version=$1

  rm -rf packages && mkdir -p packages

  for project in $js_projects; do
    local pkg_name=${project#*/}  # Remove @noir-lang/ prefix
    local aztec_name="@aztec/noir-${pkg_name}"
    local pkg_dir="packages/${pkg_name}"

    mkdir -p "$pkg_dir"

    # Get the official package to extract its version
    local npm_version=$(npm view "${project}@${version}" version 2>/dev/null || echo "$version")

    # Create package.json
    cat > "$pkg_dir/package.json" <<EOF
{
  "name": "${aztec_name}",
  "version": "${npm_version}",
  "main": "index.js",
  "types": "index.d.ts",
  "dependencies": {
    "${project}": "${npm_version}"
  }
}
EOF

    # Create index.js that re-exports the official package
    echo "module.exports = require('${project}');" > "$pkg_dir/index.js"

    # Create index.d.ts that re-exports types
    echo "export * from '${project}';" > "$pkg_dir/index.d.ts"
  done

  echo "Forwarding packages created in packages/"
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

export -f build_packages setup_forwarding_packages install_deps

function build {
  echo_header "noir install"

  # Read first line (nargo version/tag or URL)
  local ref_content=$(head -n 1 ./noir-repo-ref)
  # Read second line if present (package version for happy path)
  local pkg_version=$(sed -n '2p' ./noir-repo-ref)

  # Detect if noir-repo-ref contains a URL (has ://) or is a simple tag/version
  if [[ "$ref_content" == *"://"* ]]; then
    # Unhappy path: Clone and build from source
    echo "Detected repository URL in noir-repo-ref, building from source..."

    # Parse URL and optional branch/tag
    local repo_url branch_or_tag
    if [[ "$ref_content" == *"#"* ]]; then
      repo_url="${ref_content%#*}"
      branch_or_tag="${ref_content##*#}"
    else
      repo_url="$ref_content"
      branch_or_tag="master"
    fi

    # Clone the repo
    if [ -d noir-repo/.git ]; then
      echo "noir-repo already exists, pulling latest..."
      cd noir-repo
      git fetch origin
      git checkout "$branch_or_tag"
      git pull origin "$branch_or_tag" || true
      cd ..
    else
      echo "Cloning $repo_url (branch/tag: $branch_or_tag)..."
      git clone "$repo_url" noir-repo
      cd noir-repo
      git checkout "$branch_or_tag"
      cd ..
    fi

    # Install noirup if needed
    if ! command -v noirup &>/dev/null; then
      curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
    fi

    # Install nargo from local path
    echo "Installing nargo from local noir-repo..."
    $HOME/.nargo/bin/noirup -p noir-repo

    # Build TypeScript packages
    echo "Building TypeScript packages..."
    build_packages

  else
    # Happy path: Use official packages via forwarding
    echo "Detected version tag in noir-repo-ref, using official packages..."

    # Use package version from second line if present, otherwise use nargo version
    if [ -z "$pkg_version" ]; then
      pkg_version="$ref_content"
    fi

    # Install noirup if needed
    if ! command -v noirup &>/dev/null; then
      curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
    fi

    # Install nargo with version
    echo "Installing nargo version $ref_content..."
    $HOME/.nargo/bin/noirup -v "$ref_content"

    # Create forwarding packages using the package version
    echo "Setting up forwarding packages for version $pkg_version..."
    setup_forwarding_packages "$pkg_version"

    # For backwards compatibility, create noir-repo structure
    mkdir -p noir-repo/target/release
    ln -sf $HOME/.nargo/bin/nargo noir-repo/target/release/nargo
  fi
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
  "noir-sync")
    # Noop, we synced above.
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac

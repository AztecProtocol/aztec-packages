#!/usr/bin/env bash
# Netlify build command for deploy previews, run from docs/ (the Netlify base): the docs as CI builds
# them, plus the aztec-nr API reference generated with the Noir release this commit pins.
set -euo pipefail

docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
root=$(cd "$docs/.." && pwd)

echo "=== Checking out labs/ with the foundation's patches ==="
"$root/labs-patches/bootstrap.sh" apply

# Optional: CI builds the docs without it. Called from an `if`, so set -e is off and every step
# returns explicitly.
function api_reference {
  local noir_sha noir_tags noir_tag nargo_dir
  # The noir/noir-repo gitlink is all Netlify's clone needs: the release is the tag that points at it.
  noir_sha=$(git -C "$root" rev-parse HEAD:noir/noir-repo) || return 1
  noir_tags=$(git ls-remote --tags https://github.com/noir-lang/noir.git |
    awk -v sha="$noir_sha" '$1 == sha { sub("^refs/tags/", "", $2); sub("\\^\\{\\}$", "", $2); print $2 }') || return 1
  noir_tag=$(grep -m1 -v '^nightly' <<<"$noir_tags" || head -n1 <<<"$noir_tags")
  [ -n "$noir_tag" ] || { echo "no noir-lang/noir release tag points at $noir_sha"; return 1; }
  nargo_dir=$HOME/.cache/nargo-$noir_tag
  if [ ! -x "$nargo_dir/nargo" ]; then
    rm -rf "$nargo_dir" && mkdir -p "$nargo_dir" || return 1
    curl -fsSL "https://github.com/noir-lang/noir/releases/download/$noir_tag/noir-x86_64-unknown-linux-gnu.tar.gz" |
      tar -xz -C "$nargo_dir" || { rm -rf "$nargo_dir"; return 1; }
  fi
  echo "nargo $noir_tag: $("$nargo_dir/nargo" --version | head -n1)"
  NARGO=$nargo_dir/nargo "$docs/scripts/aztec_nr_docs_generation/generate_aztec_nr_docs.sh"
}

echo "=== Generating the aztec-nr API reference ==="
if ! api_reference; then
  echo "WARNING: this preview has no aztec-nr API reference (see above)."
fi

echo "=== Building the docs ==="
cd "$docs"
# shellcheck source=docs/scripts/node_options.sh
source "$docs/scripts/node_options.sh"
yarn build

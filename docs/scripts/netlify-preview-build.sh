#!/usr/bin/env bash
# Netlify build command for deploy previews, run from docs/ (the Netlify base): the docs as CI builds
# them, plus the aztec-nr API reference generated with the Noir release this commit pins.
set -euo pipefail

docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
root=$(cd "$docs/.." && pwd)

echo "=== Checking out labs/ with the foundation's patches ==="
"$root/labs-patches/bootstrap.sh" apply

echo "=== Generating the aztec-nr API reference ==="
# The noir/noir-repo gitlink is all Netlify's clone needs: the release is the tag that points at it.
noir_sha=$(git -C "$root" rev-parse HEAD:noir/noir-repo)
noir_tags=$(git ls-remote --tags https://github.com/noir-lang/noir.git |
  awk -v sha="$noir_sha" '$1 == sha { sub("^refs/tags/", "", $2); sub("\\^\\{\\}$", "", $2); print $2 }')
noir_tag=$(grep -m1 -v '^nightly' <<<"$noir_tags" || head -n1 <<<"$noir_tags")
if [ -z "$noir_tag" ]; then
  echo "WARNING: no noir-lang/noir release tag points at $noir_sha; this preview has no aztec-nr API reference."
else
  nargo_dir=$HOME/.cache/nargo-$noir_tag
  if [ ! -x "$nargo_dir/nargo" ]; then
    mkdir -p "$nargo_dir"
    curl -fsSL "https://github.com/noir-lang/noir/releases/download/$noir_tag/noir-x86_64-unknown-linux-gnu.tar.gz" |
      tar -xz -C "$nargo_dir"
  fi
  export NARGO=$nargo_dir/nargo
  echo "nargo $noir_tag: $("$NARGO" --version | head -n1)"
  if ! "$docs/scripts/aztec_nr_docs_generation/generate_aztec_nr_docs.sh"; then
    echo "WARNING: aztec-nr API generation failed; this preview has no aztec-nr API reference."
  fi
fi

echo "=== Building the docs ==="
cd "$docs"
source "$docs/scripts/node_options.sh"
yarn build

# shellcheck shell=bash
# aztec_node - The pinned aztec-node checkout, for scripts that read aztec-node code
#
# require_aztec_node [line] checks the checkout against its pin (scripts/aztec_node.mts check) and
# exports AZTEC_NODE_DIR: for main, docs/.aztec-node/tree unless already set; for a line,
# docs/lines/<line>/.aztec-node/tree always. Scripts read aztec-node code there, never in the labs/
# submodule, which the foundation moves on its own.

require_aztec_node() {
  local docs line=${1:-}
  docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
  if [ -n "$line" ]; then
    node "$docs/scripts/aztec_node.mts" --line "$line" check || return 1
    export AZTEC_NODE_DIR=$docs/lines/$line/.aztec-node/tree
  else
    node "$docs/scripts/aztec_node.mts" check || return 1
    export AZTEC_NODE_DIR=${AZTEC_NODE_DIR:-$docs/.aztec-node/tree}
  fi
}

# api_reference_folder [version] prints the folder under static/aztec-nr-api/ and static/typescript-api/
# that a generator writes: the docs version itself, or `next` (the dev reference previews build) when
# none is given. Anything else is refused: network URLs redirect to a version's folder, so a folder
# named after a network would shadow them, and the name ends up in an `rm -rf` path.
api_reference_folder() {
  local version=${1:-next}
  if [[ "$version" != next && ! "$version" =~ ^v[0-9][0-9A-Za-z.+-]*$ ]]; then
    echo "api_reference_folder: expected a docs version such as v6.1.0, or none for next; got '$version'" >&2
    return 1
  fi
  echo "$version"
}

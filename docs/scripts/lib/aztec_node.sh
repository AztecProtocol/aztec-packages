# shellcheck shell=bash
# aztec_node - The pinned aztec-node checkout, for scripts that read aztec-node code
#
# require_aztec_node checks the checkout against docs/aztec-node.json (scripts/aztec_node.mts
# check) and exports AZTEC_NODE_DIR, docs/.aztec-node/tree unless already set. Scripts read
# aztec-node code there, never in the labs/ submodule, which the foundation moves on its own.

require_aztec_node() {
  local docs
  docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
  node "$docs/scripts/aztec_node.mts" check || return 1
  export AZTEC_NODE_DIR=${AZTEC_NODE_DIR:-$docs/.aztec-node/tree}
}

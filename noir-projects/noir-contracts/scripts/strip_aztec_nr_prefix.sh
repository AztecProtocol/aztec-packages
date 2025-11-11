#!/usr/bin/env bash
set -euo pipefail

# This script strips the `__aztec_nr_internals__` prefix from function names in the exported contract ABI JSON.
#
# Background:
# The #[aztec] macro generates new functions prefixed with `__aztec_nr_internals__` from the original external contract
# functions (see aztec.nr and internals_functions_generation/mod.nr). The original functions are then modified to be
# uncallable (replaced with static_assert(false, ...)) to prevent developers from inadvertently calling them directly
# instead of performing proper contract calls.
#
# Why this script is needed:
# During compilation, the transformed functions with the `__aztec_nr_internals__` prefix are what actually get
# compiled into circuits. However, in the exported ABI JSON that external tools and developers use, we want to
# expose the original function names without the internal prefix. This makes the ABI cleaner and matches what
# developers originally wrote in their contracts.

json_path=$1
temp_file="${json_path}.tmp"

jq '.functions |= map(.name |= sub("^__aztec_nr_internals__"; ""))' "$json_path" > "$temp_file"
mv "$temp_file" "$json_path"

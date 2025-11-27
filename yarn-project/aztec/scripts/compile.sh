#!/usr/bin/env bash
set -euo pipefail

# If help is requested, show Aztec-specific info then run nargo compile help and then exit in order to not trigger
# transpilation
for arg in "$@"; do
  if [ "$arg" == "--help" ] || [ "$arg" == "-h" ]; then
    cat << 'EOF'
Aztec Compile - Compile Aztec Noir contracts

This command compiles Aztec Noir contracts using nargo and then automatically
postprocesses them to generate Aztec specific artifacts including:
- Transpiled contract artifacts
- Verification keys

The compiled contracts will be placed in the target/ directory by default.

---
Underlying nargo compile options:

EOF
    nargo compile --help
    exit 0
  fi
done

# Run nargo compile.
nargo compile "$@"

echo "Postprocessing contract..."
bb aztec_process

# Strip internal prefixes from all compiled contract JSONs in target directory
# TODO: This should be part of bb aztec_process!
for json in target/*.json; do
  temp_file="${json}.tmp"
  jq '.functions |= map(.name |= sub("^__aztec_nr_internals__"; ""))' "$json" > "$temp_file"
  mv "$temp_file" "$json"
done

echo "Compilation complete!"

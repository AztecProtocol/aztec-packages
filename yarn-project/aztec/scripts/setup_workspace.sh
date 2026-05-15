#!/usr/bin/env bash
set -euo pipefail

# Creates an Aztec contract workspace with a contract crate and a test crate.
# Usage: setup_workspace.sh <package_name> <template>
# Must be called from the workspace root directory.

package_name=$1
template=$2
script_path=$(realpath $(dirname "$0"))

if [ -z "$package_name" ]; then
  echo "Error: package name is required"
  exit 1
fi

if [ -f "Nargo.toml" ]; then
  echo "Error: Nargo.toml already exists in the current directory."
  echo "To add another contract crate to this workspace, use 'aztec new <name>' instead."
  exit 1
fi

# Create workspace root Nargo.toml with empty members (add_crate.sh will populate)
cat > Nargo.toml << 'EOF'
[workspace]
members = []
EOF

# Create the first crate pair
$script_path/add_crate.sh "$package_name" "$template"

# Create README
cat > README.md << REOF
# ${package_name}

An Aztec Noir contract project.

## Compile

\`\`\`bash
aztec compile
\`\`\`

This compiles all contract crates and outputs artifacts to \`target/\`.

## Test

\`\`\`bash
aztec test
\`\`\`

This runs all tests in the workspace.

## Generate TypeScript bindings

\`\`\`bash
aztec codegen target -o src/artifacts
\`\`\`

This generates TypeScript contract artifacts from the compiled output in \`target/\` into \`src/artifacts/\`.
REOF

# Create .gitignore
cat > .gitignore << 'GEOF'
target/
codegenCache.json
GEOF

echo "Created Aztec contract workspace with crates '${package_name}_contract' and '${package_name}_test'"

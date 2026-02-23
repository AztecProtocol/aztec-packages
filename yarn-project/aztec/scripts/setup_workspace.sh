#!/usr/bin/env bash
set -euo pipefail

# Creates an Aztec contract workspace with a contract crate and a test crate.
# Usage: setup_workspace.sh <package_name>
# Must be called from the workspace root directory.

package_name=$1

if [ -z "$package_name" ]; then
  echo "Error: package name is required"
  exit 1
fi

if [ -f "Nargo.toml" ]; then
  echo "Error: Nargo.toml already exists in the current directory"
  exit 1
fi

# Get the actual aztec version for the git tag.
AZTEC_VERSION=$(jq -r '.version' $(dirname $0)/../package.json)

# Create workspace root Nargo.toml
cat > Nargo.toml << 'EOF'
[workspace]
members = ["contract", "test"]
EOF

# Create contract crate
mkdir -p contract/src
cat > contract/Nargo.toml << CEOF
[package]
name = "${package_name}"
type = "contract"

[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-nr", tag="v${AZTEC_VERSION}", directory="aztec" }
CEOF

cat > contract/src/main.nr << 'EOF'
use aztec::macros::aztec;

#[aztec]
pub contract Main {
    use aztec::macros::functions::{external, initializer};

    #[initializer]
    #[external("private")]
    fn constructor() {}
}
EOF

# Create test crate
mkdir -p test/src
cat > test/Nargo.toml << TEOF
[package]
name = "${package_name}_test"
type = "lib"

[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-nr", tag="v${AZTEC_VERSION}", directory="aztec" }
${package_name} = { path = "../contract" }
TEOF

cat > test/src/lib.nr << 'NOIR'
use aztec::test::helpers::test_environment::TestEnvironment;
use __PACKAGE_NAME__::Main;

#[test]
unconstrained fn test_constructor() {
    let mut env = TestEnvironment::new();
    let deployer = env.create_light_account();

    // Deploy the contract with the default constructor:
    let contract_address = env.deploy("@__PACKAGE_NAME__/Main").with_private_initializer(
        deployer,
        Main::interface().constructor(),
    );

    // Deploy without an initializer:
    let contract_address = env.deploy("@__PACKAGE_NAME__/Main").without_initializer();
}
NOIR

sed -i "s/__PACKAGE_NAME__/${package_name}/g" test/src/lib.nr

# Create README
cat > README.md << REOF
# ${package_name}

An Aztec Noir contract project.

## Compile

\`\`\`bash
aztec compile
\`\`\`

This compiles the contract in \`contract/\` and outputs artifacts to \`target/\`.

## Test

\`\`\`bash
aztec test
\`\`\`

This runs the tests in \`test/\`.

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

echo "Created Aztec contract workspace with crates '${package_name}' and '${package_name}_test'"

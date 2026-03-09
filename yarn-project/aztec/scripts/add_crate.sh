#!/usr/bin/env bash
set -euo pipefail

# Creates a contract+test crate pair and adds them to an existing workspace.
# Usage: add_crate.sh <crate_name>
# Must be called from a workspace root that already has Nargo.toml with [workspace].

crate_name=$1

if [ -z "$crate_name" ]; then
  echo "Error: crate name is required"
  exit 1
fi

if [[ "$crate_name" == *"/"* ]] || [[ "$crate_name" == *"\\"* ]]; then
  echo "Error: crate name must not contain path separators"
  exit 1
fi

contract_dir="${crate_name}_contract"
test_dir="${crate_name}_test"

if [ -d "$contract_dir" ]; then
  echo "Error: directory '$contract_dir' already exists"
  exit 1
fi
if [ -d "$test_dir" ]; then
  echo "Error: directory '$test_dir' already exists"
  exit 1
fi

# Get the actual aztec version for the git tag.
AZTEC_VERSION=$(jq -r '.version' $(dirname $0)/../package.json)

# Create contract crate
mkdir -p "$contract_dir/src"
cat > "$contract_dir/Nargo.toml" << CEOF
[package]
name = "${crate_name}_contract"
type = "contract"

[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-nr", tag="v${AZTEC_VERSION}", directory="aztec" }
CEOF

cat > "$contract_dir/src/main.nr" << 'EOF'
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
mkdir -p "$test_dir/src"
cat > "$test_dir/Nargo.toml" << TEOF
[package]
name = "${crate_name}_test"
type = "lib"

[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-nr", tag="v${AZTEC_VERSION}", directory="aztec" }
${crate_name}_contract = { path = "../${contract_dir}" }
TEOF

cat > "$test_dir/src/lib.nr" << 'NOIR'
use aztec::test::helpers::test_environment::TestEnvironment;
use __CRATE_NAME___contract::Main;

#[test]
unconstrained fn test_constructor() {
    let mut env = TestEnvironment::new();
    let deployer = env.create_light_account();

    // Deploy the contract with the default constructor:
    let contract_address = env.deploy("@__CRATE_NAME___contract/Main").with_private_initializer(
        deployer,
        Main::interface().constructor(),
    );

    // Deploy without an initializer:
    let contract_address = env.deploy("@__CRATE_NAME___contract/Main").without_initializer();
}
NOIR

sed -i "s/__CRATE_NAME__/${crate_name}/g" "$test_dir/src/lib.nr"

# Add members to workspace Nargo.toml
if grep -q 'members\s*=\s*\[\s*\]' Nargo.toml; then
  # Empty array: members = []
  sed -i "s|members\s*=\s*\[\s*\]|members = [\"${contract_dir}\", \"${test_dir}\"]|" Nargo.toml
else
  # Non-empty array: add before closing ]
  sed -i "s|\(members\s*=\s*\[.*\)\]|\1, \"${contract_dir}\", \"${test_dir}\"]|" Nargo.toml
fi

echo "Created crates '${contract_dir}' and '${test_dir}'"

#!/usr/bin/env bash
set -euo pipefail

script_path=$(realpath $(dirname "$0"))

project_path=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      cat << 'EOF'
Aztec New - Create a new Aztec Noir project or add a contract to an existing workspace

Usage: aztec new <NAME>

Arguments:
  <NAME>  The name for the new contract (also used as the directory name when
          creating a new workspace)

Options:
  -h, --help     Print help

When run outside an existing workspace:
  Creates a new directory with a workspace containing a contract crate and a
  test crate, and automatically adds the Aztec.nr dependency to both.

When run inside an existing workspace (Nargo.toml with [workspace] exists):
  Adds a new contract crate and test crate to the existing workspace.
EOF
      exit 0
      ;;
    *)
      project_path=$1
      shift
      break
      ;;
  esac
done

if [ -z "$project_path" ]; then
  echo "Error: NAME argument is required"
  echo "Usage: aztec new <NAME>"
  echo "Run 'aztec new --help' for more information"
  exit 1
fi

package_name="$(basename $project_path)"

# Check if we're inside an existing workspace
if [ -f "Nargo.toml" ] && grep -q '\[workspace\]' Nargo.toml; then
  # Add crate pair to existing workspace
  echo "Adding contract '$package_name' to existing workspace..."
  $script_path/add_crate.sh "$package_name"
else
  # Create new workspace
  if [ -d "$project_path" ] && [ "$(ls -A $project_path 2>/dev/null)" ]; then
    echo "Error: $project_path already exists and is not empty"
    exit 1
  fi

  echo "Creating new Aztec contract project at $project_path..."
  mkdir -p "$project_path"
  cd "$project_path"
  $script_path/setup_workspace.sh "$package_name"
fi

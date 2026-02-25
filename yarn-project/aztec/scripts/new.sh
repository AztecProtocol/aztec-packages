#!/usr/bin/env bash
set -euo pipefail

script_path=$(realpath $(dirname "$0"))

name_arg=""
project_path=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      cat << 'EOF'
Aztec New - Create a new Aztec Noir project in a new directory

Usage: aztec new [OPTIONS] <PATH>

Arguments:
  <PATH>  The path to save the new project

Options:
  --name <NAME>  Name of the package [default: package directory name]
  -h, --help     Print help

This command creates a new Aztec Noir project with a workspace containing
a contract crate and a test crate, and automatically adds the Aztec.nr
dependency to both.
EOF
      exit 0
      ;;
    --name)
      name_arg="$2"
      shift 2
      ;;
    *)
      project_path=$1
      shift
      break
      ;;
  esac
done

if [ -z "$project_path" ]; then
  echo "Error: PATH argument is required"
  echo "Usage: aztec new [OPTIONS] <PATH>"
  echo "Run 'aztec new --help' for more information"
  exit 1
fi

if [ -d "$project_path" ] && [ "$(ls -A $project_path 2>/dev/null)" ]; then
  echo "Error: $project_path already exists and is not empty"
  exit 1
fi

# Derive package name: use --name if provided, otherwise use directory basename
package_name="${name_arg:-$(basename $project_path)}"

echo "Creating new Aztec contract project at $project_path..."
mkdir -p "$project_path"
cd "$project_path"
$script_path/setup_workspace.sh "$package_name"

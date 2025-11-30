#!/usr/bin/env bash
set -euo pipefail

NARGO=${NARGO:-nargo}
script_path=$(realpath $(dirname "$0"))

type_arg="--contract"

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
  --lib          Create a library template instead of a contract
  -h, --help     Print help

This command creates a new Aztec Noir project using nargo and automatically
adds the Aztec.nr dependency to your Nargo.toml file.
EOF
      exit 0
      ;;
    --lib)
      type_arg="--lib"
      shift
      ;;
    --name)
      name_arg="--name $2"
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

echo "Creating new Noir project at $project_path..."
$NARGO new $type_arg ${name_arg:-} $project_path

if [ "$type_arg" == "--contract" ]; then
  cd $project_path
  $script_path/setup_project.sh
fi

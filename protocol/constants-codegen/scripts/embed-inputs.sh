#!/usr/bin/env bash

# Copy the default Noir input file into the package's inputs/ directory, which the published tarball
# ships so the CLI works without --input. Runs from prepack and from in-repo consumers that mimic
# the published layout, so it always executes inside the monorepo where the protocol sources exist.
set -euo pipefail

package_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
types_dir="$package_dir/../../noir-projects/noir-protocol-circuits/crates/types/src"

rm -rf "$package_dir/inputs"
mkdir "$package_dir/inputs"
cp "$types_dir/constants.nr" "$package_dir/inputs/constants.nr"

#!/usr/bin/env bash

# Copy the default Noir input file into the package's inputs/ directory, which the CLI reads when
# --input is not given. Runs from the package build (so the published tarball ships it) and from
# generate.sh, so it always executes inside the monorepo where the protocol sources exist. The copy
# lands via rename because concurrent callers (e.g. parallel cmake configures) read the directory
# while it refreshes.
set -euo pipefail

package_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
types_dir="$package_dir/../../noir-projects/noir-protocol-circuits/crates/types/src"

mkdir -p "$package_dir/inputs"
cp "$types_dir/constants.nr" "$package_dir/inputs/.constants.nr.$$"
mv -f "$package_dir/inputs/.constants.nr.$$" "$package_dir/inputs/constants.nr"

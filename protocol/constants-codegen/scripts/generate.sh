#!/usr/bin/env bash

# Run the constants generator against the monorepo's protocol sources, forwarding all arguments.
# In-repo consumers invoke this instead of stating the input path themselves; the published npm
# package covers the same default with the input embedded in the tarball at pack time.
set -euo pipefail

package_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
types_dir="$package_dir/../../noir-projects/noir-protocol-circuits/crates/types/src"

node "$package_dir/src/cli.ts" \
  --input "$types_dir/constants.nr" \
  "$@"

#!/usr/bin/env bash

# Refresh the package's embedded inputs from the monorepo's protocol sources, then run the
# constants generator on its defaults, forwarding all arguments. In-repo consumers invoke this so
# their invocations are identical to those against the published package, which ships the same
# inputs embedded at pack time.
set -euo pipefail

package_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

"$package_dir/scripts/embed-inputs.sh"
node "$package_dir/src/cli.ts" "$@"

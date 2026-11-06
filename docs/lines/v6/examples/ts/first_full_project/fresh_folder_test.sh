#!/usr/bin/env bash
# Rebuilds the "Your first full project" page's project in an empty folder, the way a reader does:
# aztec init, compile and codegen, the page's package.json and tsconfig.json, this example's script
# region as src/index.ts, npm install, then a type check. It proves the page's files work outside
# this repository; the network run of the same script is aztecjs_runner's job.
#
# Needs NARGO, BB, AZTEC and AZTEC_VERSION from the pinned toolchain (`aztec_node.mts env`), and
# network access to npm and GitHub. The pages and examples are read from this script's own line.
set -euo pipefail

: "${NARGO:?}" "${BB:?}" "${AZTEC:?}" "${AZTEC_VERSION:?}"
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
docs_dir=$(cd "$script_dir/../../.." && pwd)
repo_root=$(git -C "$script_dir" rev-parse --show-toplevel)
page=$docs_dir/docs-developers/docs/tutorials/js_tutorials/first_full_project.md
start=$(date +%s)

mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"
export parent project
parent=$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/aztec-first-project.XXXXXX")
trap 'rm -rf "$parent"' EXIT
project=$parent/my_project
mkdir "$project"

# Environment hygiene, not isolation: nothing from this shell (tokens, npm config, caches) reaches
# the reader's commands, and HOME in the parent starts nargo's git cache and npm's cache empty.
# The downloaded tools still run with this machine's access.
function clean {
  (cd "$project" && env -i PATH="$PATH" HOME="$parent" NARGO="$NARGO" BB="$BB" AZTEC="$AZTEC" \
    AZTEC_VERSION="$AZTEC_VERSION" "$@")
}
export -f clean
export NARGO BB AZTEC AZTEC_VERSION
retry=$repo_root/ci3/retry

clean "$AZTEC" init
"$retry" 'clean "$AZTEC" compile'
clean "$AZTEC" codegen target -o src/artifacts

# The page as the site renders it, so its version macros resolve to this line's pin. Its script is
# this example's `full` region, extracted the way the site's include does; the page must include
# exactly that region, or the test would pass on a script readers never see.
node -e '
const fs = require("fs");
const path = require("path");
const [preprocess, page, root, example, out] = process.argv.slice(1);
const { preprocessIncludeVersion } = require(path.join(preprocess, "include_version.js"));
const { extractCodeSnippet } = require(path.join(preprocess, "include_code.js"));
const source = fs.readFileSync(page, "utf8");
const include = `#include_code full /${path.relative(root, example)} typescript`;
const includes = source.split("\n").filter((line) => line.trim() === include).length;
if (includes !== 1) throw new Error(`${page}: expected one "${include}" line, found ${includes}`);
fs.mkdirSync(path.join(out, "src"), { recursive: true });
fs.writeFileSync(path.join(out, "src", "index.ts"), `${extractCodeSnippet(example, "full")[0]}\n`);
preprocessIncludeVersion(source, page, root).then(({ content }) => {
  for (const name of ["package.json", "tsconfig.json"]) {
    const blocks = [...content.matchAll(new RegExp("^```json title=\"" + name.replace(".", "\\.") + "\"\\n([\\s\\S]*?)^```$", "gm"))];
    if (blocks.length !== 1) throw new Error(`${page}: expected one ${name} block, found ${blocks.length}`);
    const body = blocks[0][1];
    if (/#[a-z_]{4,}/.test(body)) throw new Error(`${page}: unresolved macro in ${name}: ${body.match(/#[a-z_]+/)[0]}`);
    JSON.parse(body);
    fs.writeFileSync(path.join(out, name), body);
  }
});
' "$repo_root/docs/src/preprocess" "$page" "$repo_root" "$script_dir/index.ts" "$project"

"$retry" 'clean npm install --ignore-scripts --no-audit --no-fund'
clean ./node_modules/.bin/tsc --noEmit

echo "First full project builds from an empty folder ($(( $(date +%s) - start ))s)."

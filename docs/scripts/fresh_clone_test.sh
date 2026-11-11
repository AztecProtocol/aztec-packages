#!/usr/bin/env bash
# Runs a tutorial's "Clone the example" block, as the site renders it, in an empty folder, then builds
# the example the way the page goes on to. It proves a reader's clone builds with the versions the page
# names, on the page's own line.
#
# Usage: scripts/fresh_clone_test.sh <page>, a path relative to the repository root.
# Needs NARGO, BB and AZTEC from the pinned toolchain of the page's line (`aztec_node.mts [--line <line>]
# env`), and network access to npm and GitHub. aztec-packages comes from this repository instead of GitHub,
# so the commit the page names (`#docs_commit`: DOCS_COMMIT, else HEAD) need not be pushed.
set -euo pipefail

: "${NARGO:?}" "${BB:?}" "${AZTEC:?}"
page=${1:?usage: scripts/fresh_clone_test.sh <page>}
repo_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
start=$(date +%s)

case "$page" in
  */webapp/index.md) build='yarn prep && npx tsc -b --noEmit && node esbuild.extension.mjs' ;;
  */uniswap_swap.md) build='(cd solidity && forge build --contracts example_swap --out ../../target/solidity/example_swap)
    cd .. && aztec compile --package example_uniswap
    aztec codegen target/example_uniswap-ExampleUniswap.json -o examples/ts/example_swap/artifacts
    test -s target/solidity/example_swap/ExampleUniswapPortal.sol/ExampleUniswapPortal.json' ;;
  *) echo "No build steps for $page." >&2; exit 1 ;;
esac

# The block as the site renders it, the aztec-packages remote pointed at this repository, and the
# aztec-node commit the page's line pins (a page outside docs/lines/ follows docs/aztec-node.json).
read_page=$(cat <<'EOF'
const fs = require("fs");
const path = require("path");
const [root, page] = process.argv.slice(1);
const { preprocessIncludeVersion } = require(path.join(root, "docs/src/preprocess/include_version.js"));
const file = path.join(root, page);
const line = page.match(/^docs\/lines\/(v\d+)\//)?.[1];
const pin = JSON.parse(fs.readFileSync(path.join(root, "docs", line ? `lines/${line}` : "", "aztec-node.json"), "utf8"));
preprocessIncludeVersion(fs.readFileSync(file, "utf8"), file, root).then(({ content }) => {
  const blocks = [...content.matchAll(/^```bash title="Clone the example"\n([\s\S]*?)^```$/gm)];
  if (blocks.length !== 1) throw new Error(`${page}: expected one "Clone the example" block, found ${blocks.length}`);
  let block = blocks[0][1];
  if (/#[a-z_]{4,}/.test(block)) throw new Error(`${page}: unresolved macro ${block.match(/#[a-z_]+/)[0]}`);
  const remote = "https://github.com/AztecProtocol/aztec-packages.git";
  if (block.split(remote).length !== 2) throw new Error(`${page}: expected the block to name ${remote} once`);
  block = block.replace(remote, `file://${root}`);
  const checkout = block.match(/aztec-node\.git (\S+)$/m)?.[1];
  if (!checkout) throw new Error(`${page}: the block clones no aztec-node checkout`);
  process.stdout.write(`${pin.commit}\n${checkout}\n${block}`);
});
EOF
)
rendered=$(cd "$repo_root" && node -e "$read_page" "$repo_root" "$page")
pin_commit=$(sed -n 1p <<<"$rendered")
checkout=$(sed -n 2p <<<"$rendered")
block=$(sed '1,2d' <<<"$rendered")

mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"
parent=$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/aztec-fresh-clone.XXXXXX")
trap 'rm -rf "$parent"' EXIT
mkdir "$parent/bin" "$parent/reader"
ln -s "$AZTEC" "$parent/bin/aztec"
ln -s "$NARGO" "$parent/bin/nargo"
# A local fetch ignores `git -c` settings, so the partial fetch's permission lives in the reader's HOME.
printf '[uploadpack]\n\tallowFilter = true\n' >"$parent/.gitconfig"

# Environment hygiene, not isolation: nothing from this shell (tokens, npm and yarn config, caches)
# reaches the reader's commands, and HOME in the parent starts git's, nargo's and yarn's caches empty.
# The downloaded tools still run with this machine's access.
function reader {
  (cd "$parent/reader" && env -i PATH="$parent/bin:$PATH" HOME="$parent" NARGO="$NARGO" BB="$BB" AZTEC="$AZTEC" \
    YARN_ENABLE_IMMUTABLE_INSTALLS=false PUPPETEER_SKIP_DOWNLOAD=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    bash -euo pipefail -c "$1")
}

reader "$block
got=\$(git -C \"\$(git rev-parse --show-toplevel)/$checkout\" rev-parse HEAD)
[ \"\$got\" = $pin_commit ] || { echo \"aztec-node checkout is at \$got, not the pinned $pin_commit\" >&2; exit 1; }
$build"

echo "$page: the clone builds from an empty folder ($(( $(date +%s) - start ))s)."

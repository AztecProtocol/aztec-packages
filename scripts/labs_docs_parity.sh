#!/usr/bin/env bash
# Proves the rerooted docs/ render exactly what aztec-node's own layout renders, and that every
# generated snippet link names a blob whose lines are the rendered snippet.
#
#   labs_docs_parity.sh <labs-ref>
#
# Rendering parity: the oracle is aztec-node at <labs-ref> (its docs/ tooling and the code its
# snippets read), with its content directories replaced by this repo's, includes de-rerooted
# (labs/ removed) and references left alone. Both trees run the preprocessor with the same release
# variables (COMMIT_TAG = LABS_REF = <labs-ref> unless LABS_REF is set; RELEASE_TYPE and the *_TAG
# variables pass through), and their processed-docs/ must be byte-identical.
#
# Link provenance: for each include with a source link, the link must name aztec-node at that ref,
# or aztec-packages at v<installed l1-artifacts version> for published Solidity; the snippet is
# extracted from that git blob with the preprocessor's own function and must equal the local
# extraction, line range included; and the rendered block must appear in the processed page.
#
# Needs docs/node_modules (yarn install in docs/). Writes only to a temp directory.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
ref=${1:?usage: labs_docs_parity.sh <labs-ref>}
label=${LABS_REF:-$ref}
content_dirs=(docs docs-developers docs-operate docs-participate)

function die { echo "labs_docs_parity: $*" >&2; exit 1; }
function labs { git -C "$root/labs" "$@"; }

[ -d "$root/docs/node_modules" ] || die "run yarn install in docs/ first"
sha=$(labs rev-parse --verify -q "$ref^{commit}") || {
  labs fetch -q --depth 1 origin "$ref" || die "cannot fetch $ref into labs/"
  sha=$(labs rev-parse --verify FETCH_HEAD^{commit})
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/oracle" "$tmp/cand"

# The code the snippets read, pristine at <labs-ref>: the top-level directories behind labs/ includes.
code_dirs=$(cd "$root" && git grep -h -o -E '#include_code[[:space:]]+[^[:space:]]+[[:space:]]+/?labs/[^/[:space:]]+' \
  -- "${content_dirs[@]/#/docs/}" | awk '{sub(/^\/?labs\//, "", $3); print $3}' | sort -u)
# shellcheck disable=SC2086
labs archive --format=tar "$sha" docs $code_dirs | tar -x -C "$tmp/oracle"

# Candidate: this repo's docs/ (minus build outputs and frozen snapshots), reading the same code.
rsync -a --exclude node_modules --exclude build --exclude 'processed-docs*' --exclude .docusaurus \
  --exclude static --exclude '*_versioned_docs' --exclude '.env*' "$root/docs/" "$tmp/cand/docs/"
mkdir -p "$tmp/cand/labs"
for d in $code_dirs; do ln -s "$tmp/oracle/$d" "$tmp/cand/labs/$d"; done

# Oracle: aztec-node's tooling and examples, this repo's content with includes de-rerooted.
for d in "${content_dirs[@]}"; do
  rm -rf "${tmp:?}/oracle/docs/$d"
  [ -d "$tmp/cand/docs/$d" ] && cp -a "$tmp/cand/docs/$d" "$tmp/oracle/docs/$d"
done
find "$tmp/oracle/docs" \( -path "$tmp/oracle/docs/docs/*" -o -path "$tmp/oracle/docs/docs-*/*" \) \
  -type f \( -name '*.md' -o -name '*.mdx' -o -name '*.json' \) -print0 |
  xargs -0 perl -pi -e 's{^(?!<!--)(.*#include_code\s+\S+\s+/?)labs/}{$1}'
for t in oracle cand; do ln -s "$root/docs/node_modules" "$tmp/$t/docs/node_modules"; done

for t in oracle cand; do
  (cd "$tmp/$t/docs" && COMMIT_TAG=$label LABS_REF=$label node -r dotenv/config ./src/preprocess/index.js) \
    >"$tmp/$t.log" 2>&1 || { cat "$tmp/$t.log" >&2; die "$t preprocess failed"; }
done

fail=0
if ! diff -r "$tmp/oracle/docs/processed-docs" "$tmp/cand/docs/processed-docs" >"$tmp/render.diff"; then
  echo "rendering parity FAILED: processed-docs differ from aztec-node's layout" >&2
  head -n 80 "$tmp/render.diff" >&2
  fail=1
else
  echo "rendering parity: ok ($(find "$tmp/cand/docs/processed-docs" -type f | wc -l | tr -d ' ') files)"
fi

LABEL=$label ROOT=$root CAND=$tmp/cand BLOBS=$tmp/blobs node - "${content_dirs[@]}" <<'JS' || fail=1
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const cand = process.env.CAND;
const ic = require(path.join(cand, "docs/src/preprocess/include_code.js"));
const { preprocessIncludeVersion } = require(path.join(cand, "docs/src/preprocess/include_version.js"));
const label = process.env.LABEL;
const root = process.env.ROOT;
const macro = /^(?!<!--.*)(?=.*#include_code\s+(\S+)\s+(\S+)\s+(\S+)(?:[ ]+(\S+))?).*$/gm;
const link = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)#L(\d+)-L(\d+)$/;
const blobs = new Map();
fs.mkdirSync(process.env.BLOBS, { recursive: true });

function blobFile(repo, ref, file) {
  const key = `${repo} ${ref} ${file}`;
  if (!blobs.has(key)) {
    const cwd = repo === "aztec-labs-eng/aztec-node" ? path.join(root, "labs") : root;
    const out = path.join(process.env.BLOBS, String(blobs.size));
    fs.writeFileSync(out, execFileSync("git", ["-C", cwd, "show", `${ref}:${file}`], { maxBuffer: 1 << 28 }));
    blobs.set(key, out);
  }
  return blobs.get(key);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(mdx?|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

(async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(cand, "docs/node_modules/@aztec-foundation/l1-artifacts/package.json")));
  const errors = [];
  let checked = 0, unlinked = 0;
  for (const dir of process.argv.slice(2)) {
    for (const file of walk(path.join(cand, "docs", dir))) {
      const md = fs.readFileSync(file, "utf8");
      const processed = fs.readFileSync(path.join(cand, "docs/processed-docs", dir, path.relative(path.join(cand, "docs", dir), file)), "utf8");
      let m;
      while ((m = macro.exec(md))) {
        const [line, id, rawPath, lang, opts = ""] = m;
        const where = `${path.relative(cand, file)}: ${id}`;
        try {
          const rel = path.resolve(cand, "." + (rawPath.startsWith("/") ? rawPath : `/${rawPath}`)).slice(cand.length + 1);
          const [snippet, start, end] = ic.extractCodeSnippet(path.join(cand, rel), id);
          let { content: block } = await ic.preprocessIncludeCode(line, file, cand);
          block = (await preprocessIncludeVersion(block, file, cand)).content;
          if (!processed.includes(block.trimEnd())) throw new Error("rendered block not found in the processed page");
          // raw includes and noSourceLink render no link.
          if (lang === "raw" || opts.includes("noSourceLink")) { unlinked++; continue; }
          const href = block.match(/<a href="([^"]+)"/)[1];
          const [, repo, ref, linked, a, b] = href.match(link) || [];
          if (!repo) throw new Error(`unparseable link ${href}`);
          const published = rel.startsWith("docs/node_modules/@aztec-foundation/l1-artifacts/");
          const want = published ? ["AztecProtocol/aztec-packages", `v${pkg.version}`] : ["aztec-labs-eng/aztec-node", label];
          if (repo !== want[0] || ref !== want[1]) throw new Error(`links ${repo}@${ref}, expected ${want.join("@")}`);
          const [s2, a2, b2] = ic.extractCodeSnippet(blobFile(repo, ref, linked), id);
          if (`${a2}-${b2}` !== `${a}-${b}` || `${start}-${end}` !== `${a}-${b}`)
            throw new Error(`lines L${a}-L${b}: blob has L${a2}-L${b2}, local L${start}-L${end}`);
          if (s2 !== snippet) throw new Error(`snippet differs from ${repo}@${ref}:${linked}`);
          checked++;
        } catch (e) {
          errors.push(`${where}: ${e.message.split("\n")[0]}`);
        }
      }
    }
  }
  for (const e of errors) console.error(`link provenance: ${e}`);
  console.log(`link provenance: ${checked} links checked, ${unlinked} without a source link, ${errors.length} failed`);
  process.exit(errors.length ? 1 : 0);
})();
JS

exit "$fail"

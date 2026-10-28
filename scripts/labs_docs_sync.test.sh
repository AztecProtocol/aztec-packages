#!/usr/bin/env bash
# Exercises scripts/labs_docs_sync.sh against a sandbox: a fake aztec-node upstream with docs/,
# code and the toolchain pin, and a fake foundation repo carrying it as the labs/ submodule.
# Covers import and a no-op re-import, the reroot rules, two successive syncs from a fresh
# clone (no labs objects reused), a Labs edit to a rerooted line, a yarn.lock conflict, an
# upstream deletion, a non-docs file surviving, a dirty tree refused, a conflict refused, and
# every check failure.
#
# Runs from any cwd; needs git, bash and perl.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
script=$here/labs_docs_sync.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

PASS=0
function ok { echo "  ok  $1"; PASS=$((PASS + 1)); }
function fail { echo "  FAIL  $1" >&2; exit 1; }
function expect_fail { if "$@" >/dev/null 2>&1; then return 1; fi; }

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@localhost GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@localhost
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
g() { git -c commit.gpgsign=false -c protocol.file.allow=always "$@"; }

# Upstream aztec-node: docs/ plus the code and pins it points at.
up=$tmp/upstream
g init -q -b main "$up"
g -C "$up" config uploadpack.allowAnySHA1InWant true
mkdir -p "$up/docs/docs-developers" "$up/docs/examples/contracts/c" "$up/docs/scripts/node_api_reference_generation" \
  "$up/noir-projects/aztec-nr" "$up/labs-aztec-toolchain"
cat > "$up/docs/docs-developers/page.md" <<'EOF'
---
title: Page
references: ["noir-projects/aztec-nr/lib.nr", "docs/examples/x.ts"]
---
#include_code a /noir-projects/aztec-nr/lib.nr rust
#include_code b noir-projects/aztec-nr/lib.nr rust
#include_code c /docs/examples/x.ts typescript
<!-- #include_code d /noir-projects/aztec-nr/lib.nr rust -->
Prose about yarn-project/ stays.
EOF
cat > "$up/docs/docs-developers/multi.md" <<'EOF'
---
references:
  [
    "yarn-project/a.ts",
    "docs/b.md",
  ]
---
body
EOF
printf '[package]\n[dependencies]\naztec = { path = "../../../../noir-projects/aztec-nr" }\nlocal = { path = "../d" }\n' \
  > "$up/docs/examples/contracts/c/Nargo.toml"
printf "  lines.push('references: [\"yarn-project/stdlib/a.ts\"]');\n" \
  > "$up/docs/scripts/node_api_reference_generation/generate_node_api_reference.ts"
printf '[build]\n  ignore = "./scripts/netlify-ignore-build.sh"\n  command = "yarn build"\n' > "$up/docs/netlify.toml"
printf '{\n  "dependencies": {\n    "@aztec-foundation/l1-artifacts": "1.0.0"\n  }\n}\n' > "$up/docs/package.json"
printf 'lock v1\n' > "$up/docs/yarn.lock"
printf 'gone\n' > "$up/docs/obsolete.md"
printf 'x\n' > "$up/docs/examples/x.ts"
printf '// docs:start:a\nfn a() {}\n// docs:end:a\n' > "$up/noir-projects/aztec-nr/lib.nr"
printf 'BB_VERSION=1.0.0\n' > "$up/labs-aztec-toolchain/bootstrap.sh"
g -C "$up" add -A; g -C "$up" commit -q -m "upstream v1"
v1=$(git -C "$up" rev-parse HEAD)

# The foundation repo, with labs/ at v1 and the tool under scripts/.
fnd=$tmp/fnd
g init -q -b next "$fnd"
mkdir -p "$fnd/scripts" "$fnd/docs"
cp "$script" "$fnd/scripts/"
printf '[build]\n  ignore = "exit 0"\n' > "$fnd/docs/netlify.toml"
printf 'keep\n' > "$fnd/README.md"
g -C "$fnd" submodule add -q -b main "$up" labs
git -C "$fnd" config -f .gitmodules submodule.labs.update none
g -C "$fnd" add -A; g -C "$fnd" commit -q -m "foundation with labs at v1"
sync=$fnd/scripts/labs_docs_sync.sh
export -n GIT_DIR GIT_WORK_TREE 2>/dev/null || true

# 1. import, and the reroot rules on the imported tree
"$sync" import "$v1" >/dev/null
g -C "$fnd" commit -q -m "import"
d=$fnd/docs
grep -qx 'references: \["labs/noir-projects/aztec-nr/lib.nr", "docs/examples/x.ts"\]' "$d/docs-developers/page.md" || fail "reroot: single-line references"
grep -qx '#include_code a /labs/noir-projects/aztec-nr/lib.nr rust' "$d/docs-developers/page.md" || fail "reroot: absolute include"
grep -qx '#include_code b labs/noir-projects/aztec-nr/lib.nr rust' "$d/docs-developers/page.md" || fail "reroot: relative include"
grep -qx '#include_code c /docs/examples/x.ts typescript' "$d/docs-developers/page.md" || fail "reroot: docs include untouched"
grep -qx '<!-- #include_code d /noir-projects/aztec-nr/lib.nr rust -->' "$d/docs-developers/page.md" || fail "reroot: commented include untouched"
grep -qx 'Prose about yarn-project/ stays.' "$d/docs-developers/page.md" || fail "reroot: prose untouched"
grep -qx '    "labs/yarn-project/a.ts",' "$d/docs-developers/multi.md" || fail "reroot: multi-line references"
grep -qx '    "docs/b.md",' "$d/docs-developers/multi.md" || fail "reroot: docs reference untouched"
grep -q 'path = "../../../../labs/noir-projects/aztec-nr"' "$d/examples/contracts/c/Nargo.toml" || fail "reroot: Nargo root path"
grep -q 'path = "../d"' "$d/examples/contracts/c/Nargo.toml" || fail "reroot: Nargo local path untouched"
grep -q '"labs/yarn-project/stdlib/a.ts"' "$d/scripts/node_api_reference_generation/generate_node_api_reference.ts" || fail "reroot: generator references"
{ [ "$(grep -c 'ignore' "$d/netlify.toml")" = 1 ] && grep -q '^  ignore = "exit 0"$' "$d/netlify.toml"; } || fail "reroot: Netlify guard"
[ "$(cat "$d/.labs-sync")" = "$v1" ] || fail "import: .labs-sync"
"$sync" check >/dev/null || fail "check after import"
ok "import and reroot rules"

before=$(git -C "$fnd" rev-parse 'HEAD^{tree}')
out=$("$sync" import "$v1")
grep -q "already matches" <<<"$out" || fail "re-import: not a no-op"
[ "$(git -C "$fnd" rev-parse 'HEAD^{tree}')" = "$before" ] && [ -z "$(git -C "$fnd" status --porcelain)" ] || fail "re-import changed the tree"
"$sync" reroot --check >/dev/null || fail "reroot not idempotent"
ok "re-import and reroot are no-ops"

# 2. foundation-side edits: a non-docs file, and an adaptation inside docs/
printf 'ours\n' > "$fnd/notdocs.txt"
printf 'adapted\n' >> "$d/docs-developers/multi.md"
g -C "$fnd" add -A; g -C "$fnd" commit -q -m "local work"

# 3. upstream v2: edits a rerooted line, deletes a page, bumps the lockfile
sed -i.bak 's#^\#include_code a /noir-projects/aztec-nr/lib.nr rust#\#include_code a /noir-projects/aztec-nr/lib.nr rust noTitle#' "$up/docs/docs-developers/page.md"
rm -f "$up/docs/docs-developers/page.md.bak" "$up/docs/obsolete.md"
printf 'lock v2\n' > "$up/docs/yarn.lock"
g -C "$up" add -A; g -C "$up" commit -q -m "upstream v2"
v2=$(git -C "$up" rev-parse HEAD)

# A fresh clone: labs/ holds only the gitlink commit, so both R trees are rebuilt from fetches.
clone=$tmp/clone
g clone -q "$fnd" "$clone"
g -C "$clone" submodule init -q labs
git -C "$clone" config submodule.labs.url "file://$up"   # file:// so --depth is honoured
g -C "$clone" -c submodule.labs.update=checkout submodule update -q --depth 1 labs
sync=$clone/scripts/labs_docs_sync.sh
expect_fail "$sync" sync "$v2" || fail "sync: accepted a ref that is not the gitlink"
git -C "$clone/labs" fetch -q --depth 1 origin "$v2"; git -C "$clone/labs" checkout -q "$v2"
g -C "$clone" add labs; g -C "$clone" commit -q -m "bump labs to v2"
printf 'dirty\n' >> "$clone/README.md"
expect_fail "$sync" sync "$v2" || fail "sync: accepted a dirty tree"
git -C "$clone" checkout -q -- README.md
"$sync" sync "$v2" >/dev/null || fail "sync v2"
c=$clone/docs
grep -qx '#include_code a /labs/noir-projects/aztec-nr/lib.nr rust noTitle' "$c/docs-developers/page.md" || fail "sync: Labs edit to a rerooted line"
[ ! -e "$c/obsolete.md" ] || fail "sync: upstream deletion"
grep -qx 'lock v2' "$c/yarn.lock" || fail "sync: yarn.lock"
grep -qx 'adapted' "$c/docs-developers/multi.md" || fail "sync: docs adaptation lost"
grep -qx 'ours' "$clone/notdocs.txt" || fail "sync: non-docs file lost"
[ "$(cat "$c/.labs-sync")" = "$v2" ] || fail "sync: .labs-sync"
[ -z "$(git -C "$clone" diff --cached --name-only -- ':!docs')" ] || fail "sync: staged a path outside docs/"
g -C "$clone" commit -q -m "sync v2"
"$sync" check >/dev/null || fail "check after sync"
ok "sync from a fresh clone keeps local work"

# 4. a second sync: lockfile conflict (theirs wins), then a content conflict (refused)
printf 'lock ours\n' > "$c/yarn.lock"; g -C "$clone" commit -qam "local lockfile"
printf 'lock v3\n' > "$up/docs/yarn.lock"; g -C "$up" commit -qam "upstream v3"
v3=$(git -C "$up" rev-parse HEAD)
git -C "$clone/labs" fetch -q --depth 1 origin "$v3"; git -C "$clone/labs" checkout -q "$v3"
g -C "$clone" add labs; g -C "$clone" commit -q -m "bump labs to v3"
out=$("$sync" sync "$v3")
grep -q "took aztec-node's" <<<"$out" || fail "sync: yarn.lock conflict not taken from theirs"
grep -qx 'lock v3' "$c/yarn.lock" || fail "sync: yarn.lock content"
g -C "$clone" commit -q -m "sync v3"
ok "yarn.lock conflict takes theirs"

printf 'ours\n' > "$c/examples/x.ts"; g -C "$clone" commit -qam "local x"
printf 'theirs\n' > "$up/docs/examples/x.ts"; g -C "$up" commit -qam "upstream v4"
v4=$(git -C "$up" rev-parse HEAD)
git -C "$clone/labs" fetch -q --depth 1 origin "$v4"; git -C "$clone/labs" checkout -q "$v4"
g -C "$clone" add labs; g -C "$clone" commit -q -m "bump labs to v4"
head=$(git -C "$clone" rev-parse HEAD)
out=$("$sync" sync "$v4" 2>&1) && fail "sync: conflict not refused"
grep -q 'docs/examples/x.ts' <<<"$out" || fail "sync: conflict path not printed"
[ "$(git -C "$clone" rev-parse HEAD)" = "$head" ] && [ -z "$(git -C "$clone" status --porcelain)" ] || fail "sync: conflict changed the tree"
ok "conflict refused, nothing changed"

# 5. check failures
cd "$clone"
expect_fail "$sync" check || fail "check: .labs-sync behind the gitlink"
out=$("$sync" check 2>&1) && fail "check: .labs-sync behind the gitlink (output)"
grep -qF "scripts/labs_docs_sync.sh sync $v4" <<<"$out" || fail "check: drift names the sync command"
printf '%s\n' "$v4" > docs/.labs-sync
"$sync" check >/dev/null || fail "check: clean state"
sed -i.bak 's/"1.0.0"/"2.0.0"/' docs/package.json; rm docs/package.json.bak
expect_fail "$sync" check || fail "check: l1-artifacts drift"
git checkout -q -- docs/package.json
printf '[context.production]\n  ignore = "true"\n' >> docs/netlify.toml
expect_fail "$sync" check || fail "check: second ignore key"
git checkout -q -- docs/netlify.toml
printf '#include_code e /noir-projects/aztec-nr/lib.nr rust\n' >> docs/docs-developers/page.md
expect_fail "$sync" check || fail "check: unrerooted include"
git checkout -q -- docs/docs-developers/page.md
printf '// edited\n' >> labs/noir-projects/aztec-nr/lib.nr
expect_fail "$sync" check || fail "check: uncommitted edit to a snippet source"
g -C labs checkout -q -- noir-projects/aztec-nr/lib.nr
printf '// patched\n' >> labs/noir-projects/aztec-nr/lib.nr
g -C labs commit -qam "series patch on a snippet source"
expect_fail "$sync" check || fail "check: patch series touches a snippet source"
ok "check catches drift"

echo "labs_docs_sync.test: $PASS passed"

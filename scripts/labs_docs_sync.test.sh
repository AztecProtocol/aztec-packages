#!/usr/bin/env bash
# Exercises scripts/labs_docs_sync.sh against a sandbox: a fake aztec-node upstream with docs/,
# code and the toolchain pin, and a fake foundation repo carrying it as the labs/ submodule, which
# also stands in for the docs checkout (AZTEC_NODE_DIR). Covers import and a no-op re-import, the
# reroot rules, two successive syncs from a fresh clone (no labs objects reused, no gitlink move),
# a Labs edit to a rerooted line, a yarn.lock conflict, an upstream deletion, a non-docs file
# surviving, the kept set staying ours, a key-shaped default never reaching the repository, a dirty
# tree refused, a conflict refused, and every check failure.
#
# Runs from any cwd; needs git, bash, perl and Python 3.11+.
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
# The kept set: snapshots, version files, the networks page and released API trees stay ours.
kept=(developer_versioned_docs/version-v1/a.md developer_version_config.json docs/networks.md
  static/typescript-api/mainnet/i.md)
for f in "${kept[@]}"; do mkdir -p "$(dirname "$up/docs/$f")"; printf 'up v1\n' > "$up/docs/$f"; done
g -C "$up" add -A; g -C "$up" commit -q -m "upstream v1"
v1=$(git -C "$up" rev-parse HEAD)

# The foundation repo, with labs/ at v1 and the tool and its helper under scripts/.
fnd=$tmp/fnd
g init -q -b next "$fnd"
mkdir -p "$fnd/scripts" "$fnd/docs/scripts/lib"
cp "$script" "$fnd/scripts/"
cp "$here/../docs/scripts/lib/key_defaults.sh" "$tmp/key_defaults.sh"
cp "$tmp/key_defaults.sh" "$fnd/docs/scripts/lib/"
printf '[build]\n  ignore = "exit 0"\n' > "$fnd/docs/netlify.toml"
printf 'keep\n' > "$fnd/README.md"
g -C "$fnd" submodule add -q -b main "$up" labs
git -C "$fnd" config -f .gitmodules submodule.labs.update none
g -C "$fnd" add -A; g -C "$fnd" commit -q -m "foundation with labs at v1"
sync=$fnd/scripts/labs_docs_sync.sh
export -n GIT_DIR GIT_WORK_TREE 2>/dev/null || true
export AZTEC_NODE_DIR=$fnd/labs

# 1. import, and the reroot rules on the imported tree
"$sync" import "$v1" >/dev/null
d=$fnd/docs
mkdir -p "$d/scripts/lib"; cp "$tmp/key_defaults.sh" "$d/scripts/lib/"   # ours: import replaced docs/
g -C "$fnd" add docs; g -C "$fnd" commit -q -m "import"
for f in "${kept[@]}"; do [ ! -e "$d/$f" ] || fail "import: kept path $f came from aztec-node"; done
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
cmp -s "$up/docs/netlify.toml" "$d/netlify.toml" || fail "reroot: netlify.toml untouched"
[ "$(cat "$d/.labs-sync")" = "$v1" ] || fail "import: .labs-sync"
out=$("$sync" check 2>&1) && fail "check: Labs' netlify.toml builds production"
grep -qF "[build] command must be 'exit 1'" <<<"$out" || { echo "$out" >&2; fail "check: names the Netlify problem"; }
ok "import and reroot rules"

before=$(git -C "$fnd" rev-parse 'HEAD^{tree}')
out=$("$sync" import "$v1" 2>&1) && fail "re-import: replaced docs/ carrying local work (the helper)"
grep -q "use sync" <<<"$out" || fail "re-import: refusal does not name sync"
[ "$(git -C "$fnd" rev-parse 'HEAD^{tree}')" = "$before" ] && [ -z "$(git -C "$fnd" status --porcelain)" ] || fail "re-import changed the tree"
"$sync" reroot --check >/dev/null || fail "reroot not idempotent"
ok "re-import over local work is refused; reroot is a no-op"

cat > "$d/netlify.toml" <<'EOF'
[build]
  ignore = "exit 0"
  command = "exit 1"

[context.production]
  ignore = "exit 0"
  command = "exit 1"

[context.branch-deploy]
  ignore = "exit 0"
  command = "exit 1"

[context.deploy-preview]
  ignore = "./scripts/netlify-ignore-build.sh"
  command = "./scripts/netlify-preview-build.sh"
EOF
g -C "$fnd" commit -qam "netlify: deploy previews only"
"$sync" check >/dev/null || fail "check after import"
"$sync" reroot --check >/dev/null || fail "reroot: rewrites the foundation's netlify.toml"
ok "the foundation's netlify.toml passes check"

# 2. foundation-side edits: a non-docs file, an adaptation inside docs/, the kept set
printf 'ours\n' > "$fnd/notdocs.txt"
printf 'adapted\n' >> "$d/docs-developers/multi.md"
for f in "${kept[@]}"; do mkdir -p "$(dirname "$d/$f")"; printf 'ours\n' > "$d/$f"; done
g -C "$fnd" add -A; g -C "$fnd" commit -q -m "local work"

# 3. upstream v2: edits a rerooted line, deletes a page, bumps the lockfile, edits, adds and deletes
# kept paths, and prints a key-shaped default (generated per run, never a fixture) beside a salt
sed -i.bak 's#^\#include_code a /noir-projects/aztec-nr/lib.nr rust#\#include_code a /noir-projects/aztec-nr/lib.nr rust noTitle#' "$up/docs/docs-developers/page.md"
rm -f "$up/docs/docs-developers/page.md.bak" "$up/docs/obsolete.md"
printf 'lock v2\n' > "$up/docs/yarn.lock"
printf 'up v2\n' > "$up/docs/developer_versioned_docs/version-v1/a.md"
printf 'up v2\n' > "$up/docs/docs/networks.md"
rm "$up/docs/developer_version_config.json" "$up/docs/static/typescript-api/mainnet/i.md"
mkdir -p "$up/docs/developer_versioned_docs/version-v2" "$up/docs/network_versioned_sidebars"
printf 'new\n' > "$up/docs/developer_versioned_docs/version-v2/b.md"
printf '{}\n' > "$up/docs/network_versioned_sidebars/s.json"
key=0x$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
salt=0x$(printf '%063d1' 0)
cat > "$up/docs/docs-developers/cli.md" <<EOF
- \`--l1-private-key <string>\` - The private key (default: "$key")
- \`--salt <string>\` - The salt (default: "$salt")
EOF
cp "$up/docs/docs-developers/cli.md" "$up/docs/developer_versioned_docs/version-v2/cli.md"
g -C "$up" add -A; g -C "$up" commit -q -m "upstream v2"
v2=$(git -C "$up" rev-parse HEAD)

# A fresh clone: labs/ holds only the gitlink commit, so both R trees are rebuilt from fetches.
clone=$tmp/clone
g clone -q "$fnd" "$clone"
g -C "$clone" submodule init -q labs
git -C "$clone" config submodule.labs.url "file://$up"   # file:// so --depth is honoured
g -C "$clone" -c submodule.labs.update=checkout submodule update -q --depth 1 labs
sync=$clone/scripts/labs_docs_sync.sh
export AZTEC_NODE_DIR=$clone/labs
printf 'dirty\n' >> "$clone/README.md"
expect_fail "$sync" sync "$v2" || fail "sync: accepted a dirty tree"
git -C "$clone" checkout -q -- README.md
"$sync" sync "$v2" >/dev/null || fail "sync v2 (the gitlink is still v1)"
c=$clone/docs
grep -qx '#include_code a /labs/noir-projects/aztec-nr/lib.nr rust noTitle' "$c/docs-developers/page.md" || fail "sync: Labs edit to a rerooted line"
[ ! -e "$c/obsolete.md" ] || fail "sync: upstream deletion"
grep -qx 'lock v2' "$c/yarn.lock" || fail "sync: yarn.lock"
grep -qx 'adapted' "$c/docs-developers/multi.md" || fail "sync: docs adaptation lost"
grep -qx 'ours' "$clone/notdocs.txt" || fail "sync: non-docs file lost"
[ "$(cat "$c/.labs-sync")" = "$v2" ] || fail "sync: .labs-sync"
[ -z "$(git -C "$clone" diff --cached --name-only -- ':!docs')" ] || fail "sync: staged a path outside docs/"
for f in "${kept[@]}"; do grep -qx ours "$c/$f" || fail "sync: kept path $f not ours"; done
[ ! -e "$c/developer_versioned_docs/version-v2" ] && [ ! -e "$c/network_versioned_sidebars" ] || fail "sync: kept-set additions came in"
grep -qxF -- "- \`--l1-private-key <string>\` - The private key" "$c/docs-developers/cli.md" || fail "sync: key-shaped default not scrubbed"
grep -qxF -- "- \`--salt <string>\` - The salt (default: \"$salt\")" "$c/docs-developers/cli.md" || fail "sync: salt scrubbed"
! git -C "$clone" cat-file --batch-all-objects --batch | grep -qF "${key#0x}" || fail "sync: the key reached the object store"
g -C "$clone" commit -q -m "sync v2"
git -C "$clone/labs" checkout -q "$v2"; g -C "$clone" add labs; g -C "$clone" commit -q -m "bump labs to v2"
"$sync" check >/dev/null || fail "check after sync"
ok "sync from a fresh clone keeps local work and the kept set, drops key-shaped defaults"

# A key-shaped default in a form the scrub cannot remove stops the sync before anything is written.
printf 'default = "%s"\n' "$key" > "$up/docs/docs-developers/raw.toml"; g -C "$up" add -A; g -C "$up" commit -q -m "raw key"
vk=$(git -C "$up" rev-parse HEAD)
out=$("$sync" sync "$vk" 2>&1) && fail "sync: unscrubbable key accepted"
grep -q "docs/docs-developers/raw.toml:1 0x${key:2:4}" <<<"$out" || fail "sync: unscrubbable key not located"
! grep -qF "${key:2:5}" <<<"$out" || fail "sync: printed more than 4 hex characters of the key"
! git -C "$clone" cat-file --batch-all-objects --batch | grep -qF "${key#0x}" || fail "sync: the refused key reached the object store"
[ -z "$(git -C "$clone" status --porcelain)" ] || fail "sync: refusal changed the tree"
g -C "$up" rm -q docs/docs-developers/raw.toml; g -C "$up" commit -q -m "drop raw key"
ok "an unscrubbable key refuses the sync"

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
function netlify_case { # <label> <perl substitution on the whole file>
  perl -0pi -e "$2" docs/netlify.toml
  expect_fail "$sync" check || fail "check: $1"
  git checkout -q -- docs/netlify.toml
}
# shellcheck disable=SC2016 # perl code
{
  netlify_case "[build] builds" 's/command = "exit 1"/command = "yarn build"/'
  netlify_case "production builds" 's/(\[context\.production\]\n  ignore = )"exit 0"/$1"true"/'
  netlify_case "branch deploys build" 's/(\[context\.branch-deploy\]\n  ignore = "exit 0"\n  command = )"exit 1"/$1"yarn build"/'
  netlify_case "a branch-named context" '$_ .= qq{[context.next]\n  command = "yarn build"\n}'
  netlify_case "a nested build table" '$_ .= qq{[context.deploy-preview.build]\n  command = "yarn build"\n}'
  netlify_case "a duplicate key" 's/(\[build\]\n)/$1  ignore = "true"\n/'
}
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

#!/usr/bin/env bash
# Manual test suite for the frozen deps store: the CACHE_LINK_DIR link mode in ci3/cache_download and
# the scripts/worktrees.sh lifecycle (create / status / thaw / gc). NOT wired into CI — run by hand:
#
#   scripts/worktrees.test.sh
#
# Everything runs against hermetic fixture repos and a scratch store under /tmp. The real checkout is
# only read from (ci3/ and scripts/worktrees.sh are copied into the fixtures); nothing outside the
# temp root is created or modified. Scenario 0 additionally runs the existing ci3/cache_local.test.sh
# suite (which is equally hermetic).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root=$(mktemp -d /tmp/worktrees-test-XXXXXX)
passed=0
failed=0

cleanup() {
  # Store entries are frozen (chmod -R a-w), so make everything writable before removing.
  chmod -R u+w "$test_root" 2>/dev/null || true
  rm -rf "$test_root"
}
trap cleanup EXIT

log()  { echo -e "\n\033[1m$1\033[0m"; }
pass() { echo -e "  \033[32m✓ $1\033[0m"; ((++passed)); }
fail() { echo -e "  \033[31m✗ $1\033[0m"; ((++failed)); }

# check <desc> <cmd...>: pass if the command succeeds.
check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$desc"; else fail "$desc"; fi
}
# check_not <desc> <cmd...>: pass if the command fails.
check_not() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then fail "$desc"; else pass "$desc"; fi
}
assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then pass "$desc"; else fail "$desc — output missing '$needle'"; fi
}
assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then fail "$desc — output unexpectedly contains '$needle'"; else pass "$desc"; fi
}

# ---------------------------------------------------------------------------------------------------
# Environment hygiene: nothing from the invoking shell or the user's real cache/git config may leak.
# ---------------------------------------------------------------------------------------------------
unset root ci3 REF_NAME NO_CACHE NO_CACHE_UPLOAD S3_FORCE_UPLOAD S3_BUILD_CACHE_AWS_PARAMS \
  CACHE_SSH_HOST DOCS_WORKING_DIR NATIVE_PRESET 2>/dev/null || true
export CI=0
export CI_REDIS_AVAILABLE=0
export CACHE_LOCAL_DIR="$test_root/cache"
export CACHE_LINK_DIR="$test_root/cache/extracted"
mkdir -p "$CACHE_LOCAL_DIR"

export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_GLOBAL="$test_root/gitconfig"
cat > "$GIT_CONFIG_GLOBAL" <<'EOF'
[user]
	name = Test Tester
	email = test@example.com
[protocol "file"]
	allow = always
[init]
	defaultBranch = main
EOF

# ---------------------------------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------------------------------

fixture="$test_root/source-fixture"

# A minimal git repo with a real ci3/ copy, so cache_download can be invoked with CWD inside it
# (cache_download resolves ci3 from the CWD's git root).
make_mini_repo() {
  local dir="$1"
  mkdir -p "$dir"
  git -C "$dir" init -q
  cp -a "$repo_root/ci3" "$dir/ci3"
  printf 'out/\ndest/\nnode_modules/\n.yarn/\n.deps-manifest.json\n.deps-manifest.linked\n' > "$dir/.gitignore"
  git -C "$dir" add .gitignore ci3
  git -C "$dir" commit -qm init
}

# make_tarball <name> <stage-dir> <member...>: tar members into the local tarball cache, mirroring
# what cache_upload produces (member paths relative to the component dir, no leading ./).
make_tarball() {
  local name="$1" stage="$2"; shift 2
  tar -czf "$CACHE_LOCAL_DIR/$name" -C "$stage" "$@"
}

# The source fixture stands in for a fully bootstrapped aztec-packages checkout: worktrees.sh +
# ci3 + a yarn-project with an untracked writable layer + one fake upstream component
# (l1-contracts, chosen because it is in worktrees.sh's UPSTREAM_COMPONENTS list) + a noir/noir-repo
# submodule (create requires one to init).
make_fixture() {
  make_mini_repo "$fixture"
  mkdir -p "$fixture/scripts"
  cp -a "$repo_root/scripts/worktrees.sh" "$fixture/scripts/worktrees.sh"

  mkdir -p "$fixture/yarn-project/pkg/src"
  echo "lock-v1" > "$fixture/yarn-project/yarn.lock"
  echo "export {};" > "$fixture/yarn-project/pkg/src/index.ts"

  mkdir -p "$fixture/l1-contracts"
  cat > "$fixture/l1-contracts/bootstrap.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
"$(git rev-parse --show-toplevel)/ci3/cache_download" fake-l1-1111.tar.gz
EOF
  chmod +x "$fixture/l1-contracts/bootstrap.sh"

  git init -q "$test_root/noir-repo-upstream"
  echo "noir" > "$test_root/noir-repo-upstream/README.md"
  git -C "$test_root/noir-repo-upstream" add README.md
  git -C "$test_root/noir-repo-upstream" commit -qm init
  git -C "$fixture" submodule --quiet add "$test_root/noir-repo-upstream" noir/noir-repo

  git -C "$fixture" add scripts yarn-project l1-contracts .gitmodules noir
  git -C "$fixture" commit -qm fixture

  # Untracked, gitignored writable yarn layer — what `create` copies into worktrees.
  mkdir -p "$fixture/yarn-project/node_modules/foo" "$fixture/yarn-project/node_modules/@aztec" \
    "$fixture/yarn-project/pkg/node_modules/bar" "$fixture/yarn-project/pkg/dest" \
    "$fixture/yarn-project/.yarn/cache"
  echo "console.log(1);" > "$fixture/yarn-project/node_modules/foo/index.js"
  ln -s ../../pkg "$fixture/yarn-project/node_modules/@aztec/pkg"
  echo "bar" > "$fixture/yarn-project/pkg/node_modules/bar/b.js"
  echo "built" > "$fixture/yarn-project/pkg/dest/out.js"
  echo "zip" > "$fixture/yarn-project/.yarn/cache/pkg.zip"
  echo "state" > "$fixture/yarn-project/.yarn/install-state.gz"
}

make_tarballs() {
  local stage
  stage="$test_root/stage-l1"
  mkdir -p "$stage/out/bin" "$stage/out/generated"
  printf '#!/bin/sh\necho fake-bb\n' > "$stage/out/bin/fake-binary"
  chmod +x "$stage/out/bin/fake-binary"
  echo '{"abi":[]}' > "$stage/out/generated/data.json"
  make_tarball fake-l1-1111.tar.gz "$stage" out

  stage="$test_root/stage-override"
  mkdir -p "$stage/out/bin" "$stage/out/generated"
  echo "store-version" > "$stage/out/bin/fake-binary"
  echo "override-version" > "$stage/out/generated/data.json"
  make_tarball override-2222.tar.gz "$stage" out

  stage="$test_root/stage-loose"
  mkdir -p "$stage"
  echo "loose" > "$stage/loose-file.bin"
  make_tarball loose-3333.tar.gz "$stage" loose-file.bin

  stage="$test_root/stage-plain"
  mkdir -p "$stage/out/bin"
  echo "plain" > "$stage/out/bin/plain.txt"
  make_tarball plain-1234.tar.gz "$stage" out

  stage="$test_root/stage-ci"
  mkdir -p "$stage/out"
  echo "ci" > "$stage/out/ci.txt"
  make_tarball ci-mode-5555.tar.gz "$stage" out

  stage="$test_root/stage-yp"
  mkdir -p "$stage/dest"
  echo "yp" > "$stage/dest/x.js"
  make_tarball yarn-project-6666.tar.gz "$stage" dest
  make_tarball bb.js-7777.tar.gz "$stage" dest

  stage="$test_root/stage-concurrent"
  mkdir -p "$stage/out/bin"
  dd if=/dev/urandom of="$stage/out/blob.bin" bs=1M count=4 status=none
  echo "c" > "$stage/out/bin/c.txt"
  make_tarball concurrent-4444.tar.gz "$stage" out

  stage="$test_root/stage-ancient"
  mkdir -p "$stage/out"
  echo "old" > "$stage/out/old.txt"
  make_tarball ancient-9999.tar.gz "$stage" out
  touch -m -d '40 days ago' "$CACHE_LOCAL_DIR/ancient-9999.tar.gz"

  stage="$test_root/stage-young"
  mkdir -p "$stage/out"
  echo "young" > "$stage/out/young.txt"
  make_tarball young-8888.tar.gz "$stage" out
}

# Run cache_download from inside the fixture's l1-contracts dir, as a component bootstrap would.
dl() {
  (cd "$fixture/l1-contracts" && "$fixture/ci3/cache_download" "$@" 2>&1)
}

# ---------------------------------------------------------------------------------------------------
# Scenario 0: the pre-existing local-cache suite (includes the new CI=0 cache_upload test) still passes.
# ---------------------------------------------------------------------------------------------------
scenario_0_cache_local_suite() {
  log "Scenario 0: ci3/cache_local.test.sh (legacy suite, link mode off)"
  local out
  if out=$(env -u CACHE_LINK_DIR -u CACHE_LOCAL_DIR "$repo_root/ci3/cache_local.test.sh" 2>&1); then
    pass "cache_local.test.sh suite passed"
  else
    fail "cache_local.test.sh suite failed"
    echo "$out" | tail -30
  fi
}

# ---------------------------------------------------------------------------------------------------
# Scenario 1: create --dry-run resolves source, path, and branch without touching anything.
# ---------------------------------------------------------------------------------------------------
scenario_1_dry_run() {
  log "Scenario 1: create --dry-run name/branch resolution"
  local out

  out=$( (cd "$fixture" && scripts/worktrees.sh create featx --dry-run 2>&1) || true )
  assert_contains "branch derives initials from user.name" "$out" "tt/featx"
  assert_contains "worktree lands as a sibling of the source" "$out" "$test_root/featx"
  assert_contains "source resolves to the fixture checkout" "$out" "source:   $fixture"
  check_not "dry-run creates nothing" test -e "$test_root/featx"

  git -C "$fixture" config user.initials xy
  out=$( (cd "$fixture" && scripts/worktrees.sh create featy --dry-run 2>&1) || true )
  assert_contains "user.initials takes precedence over user.name" "$out" "xy/featy"
  git -C "$fixture" config --unset user.initials

  out=$( (cd "$fixture" && scripts/worktrees.sh create ab/custom-branch --dry-run 2>&1) || true )
  assert_contains "a name with a slash is the full branch" "$out" "branch:   ab/custom-branch"
  assert_contains "slashed name: dir is the last segment" "$out" "$test_root/custom-branch"

  out=$( (cd "$fixture" && scripts/worktrees.sh create featz --branch 2>&1) || true )
  assert_contains "--branch without a value dies cleanly" "$out" "requires a value"
}

# ---------------------------------------------------------------------------------------------------
# Scenario 2: create — the full worktree flow against the fake component and store.
# ---------------------------------------------------------------------------------------------------
scenario_2_create() {
  log "Scenario 2: create wt1 (submodule init, yarn layer copy, link-mode graft, freeze)"
  local out wt1="$test_root/wt1"
  out=$( (cd "$fixture" && scripts/worktrees.sh create wt1 2>&1) || true )

  check "worktree created" test -d "$wt1"
  check "on the expected branch" test "$(git -C "$wt1" rev-parse --abbrev-ref HEAD 2>/dev/null)" = "tt/wt1"
  check "noir-repo submodule initialized" test -f "$wt1/noir/noir-repo/README.md"
  assert_not_contains "base has CACHE_LINK_DIR support (no fallback warning)" "$out" "no CACHE_LINK_DIR support"

  # Copied yarn layer.
  check "root node_modules copied" test -f "$wt1/yarn-project/node_modules/foo/index.js"
  check "@aztec workspace symlink preserved as relative" \
    test "$(readlink "$wt1/yarn-project/node_modules/@aztec/pkg" 2>/dev/null)" = "../../pkg"
  check "nested workspace node_modules copied" test -f "$wt1/yarn-project/pkg/node_modules/bar/b.js"
  check ".yarn/cache copied" test -f "$wt1/yarn-project/.yarn/cache/pkg.zip"
  check "build outputs copied (same content state)" test -f "$wt1/yarn-project/pkg/dest/out.js"
  assert_contains "build-output copy reported" "$out" "Copied 3 build-output files."

  # Grafted store links: `out/` is a dir-only gitignore pattern, so the link root must degrade to a
  # real dir with symlinks one level deeper.
  check "link root degraded to a real dir (dir-only ignore pattern)" test -d "$wt1/l1-contracts/out"
  check "degraded link root is not a symlink" test ! -L "$wt1/l1-contracts/out"
  check "out/bin grafted as a store symlink" test -L "$wt1/l1-contracts/out/bin"
  check "symlink resolves into the store entry" \
    test "$(readlink -f "$wt1/l1-contracts/out/bin")" = "$CACHE_LINK_DIR/fake-l1-1111/out/bin"
  check "out/generated grafted as a store symlink" test -L "$wt1/l1-contracts/out/generated"
  check "linked content readable through symlink" grep -q "fake-bb" "$wt1/l1-contracts/out/bin/fake-binary"

  # Freeze semantics.
  check_not "write through store symlink is rejected" \
    bash -c "echo x >> '$wt1/l1-contracts/out/bin/fake-binary'"
  check_not "creating a file in a store-linked dir is rejected" touch "$wt1/l1-contracts/out/bin/hax"
  check_not "store file is not writable" test -w "$CACHE_LINK_DIR/fake-l1-1111/out/bin/fake-binary"

  # The property the grafting logic exists to protect: a clean git status (a dirty status would flip
  # content hashes to disabled-cache repo-wide).
  check "worktree git status is clean after grafting" test -z "$(git -C "$wt1" status --porcelain)"

  # Manifests.
  check ".deps-manifest.linked records the entry" grep -qx "fake-l1-1111" "$wt1/.deps-manifest.linked"
  check ".deps-manifest.json records the entry" \
    jq -e '.linked | index("fake-l1-1111")' "$wt1/.deps-manifest.json"
  check ".deps-manifest.json records copied layer items" \
    jq -e '.copied | length >= 4' "$wt1/.deps-manifest.json"

  # status command.
  out=$( (cd "$wt1" && ./scripts/worktrees.sh status 2>&1) || true )
  assert_contains "status shows the linked entry as ok" "$out" "[ok]      fake-l1-1111"
  assert_contains "status reports yarn.lock unchanged" "$out" "yarn.lock: unchanged"
}

# ---------------------------------------------------------------------------------------------------
# Scenario 3: a second worktree reuses the store entry (extract-once).
# ---------------------------------------------------------------------------------------------------
scenario_3_second_worktree() {
  log "Scenario 3: create wt2 reuses the store (extract-once)"
  local out wt2="$test_root/wt2"
  local mtime_before mtime_after
  mtime_before=$(stat -c %Y "$CACHE_LINK_DIR/fake-l1-1111")

  out=$( (cd "$fixture" && scripts/worktrees.sh create wt2 2>&1) || true )
  mtime_after=$(stat -c %Y "$CACHE_LINK_DIR/fake-l1-1111")

  check "wt2 created" test -d "$wt2"
  assert_contains "tarball came from the local cache" "$out" "Local cache hit for fake-l1-1111.tar.gz"
  check "wt2 links the same store entry" \
    test "$(readlink -f "$wt2/l1-contracts/out/bin")" = "$CACHE_LINK_DIR/fake-l1-1111/out/bin"
  check "store entry was not re-extracted" test "$mtime_before" = "$mtime_after"
  check "store holds exactly one fake-l1 entry" \
    test "$(ls "$CACHE_LINK_DIR" | grep -c '^fake-l1-')" = "1"

  # Creating onto a pre-existing branch checks it out but must warn that an explicit base-ref is
  # ignored (the worktree lands wherever the branch already points).
  git -C "$fixture" branch tt/wt3
  out=$( (cd "$fixture" && scripts/worktrees.sh create wt3 HEAD 2>&1) || true )
  assert_contains "existing branch reused with a warning about the ignored base-ref" "$out" "already exists"
  check "wt3 is on the pre-existing branch" \
    test "$(git -C "$test_root/wt3" rev-parse --abbrev-ref HEAD 2>/dev/null)" = "tt/wt3"
  git -C "$fixture" worktree remove --force --force "$test_root/wt3" 2>/dev/null || rm -rf "$test_root/wt3"
  git -C "$fixture" worktree prune
  git -C "$fixture" branch -qD tt/wt3
}

# ---------------------------------------------------------------------------------------------------
# Scenario 4: thaw replaces symlinks with writable copies, per-worktree.
# ---------------------------------------------------------------------------------------------------
scenario_4_thaw() {
  log "Scenario 4: thaw wt1's out/bin"
  local out wt1="$test_root/wt1" wt2="$test_root/wt2"
  out=$( (cd "$wt1" && ./scripts/worktrees.sh thaw l1-contracts/out/bin 2>&1) || true )

  assert_contains "thaw reports one thawed entry" "$out" "Thawed 1 store entry"
  check "thawed path is a real dir" test -d "$wt1/l1-contracts/out/bin"
  check "thawed path is no longer a symlink" test ! -L "$wt1/l1-contracts/out/bin"
  check "thawed content survived" grep -q "fake-bb" "$wt1/l1-contracts/out/bin/fake-binary"
  check "thawed copy is writable" touch "$wt1/l1-contracts/out/bin/scratch.txt"
  check "store stays frozen" test ! -w "$CACHE_LINK_DIR/fake-l1-1111/out/bin/fake-binary"
  check "wt2's symlink is untouched" test -L "$wt2/l1-contracts/out/bin"
  check_not "thawed entry dropped from .deps-manifest.linked" \
    grep -qx "fake-l1-1111" "$wt1/.deps-manifest.linked"
  check "thawed entry dropped from .deps-manifest.json" \
    jq -e '.linked | index("fake-l1-1111") == null' "$wt1/.deps-manifest.json"
  check "wt2's manifest still records the entry" grep -qx "fake-l1-1111" "$wt2/.deps-manifest.linked"

  # thaw must refuse symlinks that do not point into the store (e.g. yarn workspace symlinks):
  # thawing one would destroy it and materialize a copy of the target in its place.
  out=$( (cd "$wt2" && ./scripts/worktrees.sh thaw yarn-project/node_modules/@aztec/pkg 2>&1) || true )
  assert_contains "non-store symlink refused" "$out" "does not point into the deps store"
  check "workspace symlink left intact" \
    test "$(readlink "$wt2/yarn-project/node_modules/@aztec/pkg" 2>/dev/null)" = "../../pkg"
}

# ---------------------------------------------------------------------------------------------------
# Scenario 5: cache_download link-mode behaviors, invoked directly as a bootstrap would.
# ---------------------------------------------------------------------------------------------------
scenario_5_cache_download_modes() {
  log "Scenario 5: cache_download link-mode gating, overrides, warnings, repointing"
  local out

  # 5a. No CACHE_LINK_DIR -> extract in place (pre-existing behavior).
  out=$( (cd "$fixture" && env -u CACHE_LINK_DIR ci3/cache_download plain-1234.tar.gz "$test_root/scratch-plain" 2>&1) || true )
  check "no CACHE_LINK_DIR: real files extracted" test -f "$test_root/scratch-plain/out/bin/plain.txt"
  check "no CACHE_LINK_DIR: extracted dir is not a symlink" test ! -L "$test_root/scratch-plain/out"
  check_not "no CACHE_LINK_DIR: no store entry created" test -e "$CACHE_LINK_DIR/plain-1234"

  # 5b. Excluded tarball names always extract in place, even in link mode.
  out=$( (cd "$fixture" && ci3/cache_download yarn-project-6666.tar.gz "$test_root/scratch-yp" 2>&1) || true )
  check "yarn-project-*: real files extracted" test -f "$test_root/scratch-yp/dest/x.js"
  check "yarn-project-*: extracted path is not a symlink" test ! -L "$test_root/scratch-yp/dest"
  check_not "yarn-project-*: no store entry" test -e "$CACHE_LINK_DIR/yarn-project-6666"
  out=$( (cd "$fixture" && ci3/cache_download bb.js-7777.tar.gz "$test_root/scratch-bbjs" 2>&1) || true )
  check_not "bb.js-*: no store entry" test -e "$CACHE_LINK_DIR/bb.js-7777"

  # 5c. CI=1 hard-disables link mode.
  out=$( (cd "$fixture" && CI=1 ci3/cache_download ci-mode-5555.tar.gz "$test_root/scratch-ci" 2>&1) || true )
  check "CI=1: real files extracted" test -f "$test_root/scratch-ci/out/ci.txt"
  check_not "CI=1: no store entry" test -e "$CACHE_LINK_DIR/ci-mode-5555"

  # 5d. A real file at a link root is a local override: left alone with a warning.
  mkdir -p "$fixture/l1-contracts/out/bin"
  echo "local-override" > "$fixture/l1-contracts/out/bin/fake-binary"
  out=$(dl override-2222.tar.gz || true)
  assert_contains "local override warning emitted" "$out" "local override"
  check "local file left untouched" grep -q "local-override" "$fixture/l1-contracts/out/bin/fake-binary"
  check "local file is still a real file" test ! -L "$fixture/l1-contracts/out/bin/fake-binary"
  check "sibling path still grafted" test -L "$fixture/l1-contracts/out/generated"
  check "sibling resolves to the override entry" \
    test "$(readlink -f "$fixture/l1-contracts/out/generated")" = "$CACHE_LINK_DIR/override-2222/out/generated"

  # 5e. A link root that would not be gitignored warns and shows as untracked (file target, so no
  # dir degradation is possible).
  out=$(dl loose-3333.tar.gz || true)
  assert_contains "not-gitignored warning emitted" "$out" "not gitignored"
  check "loose file grafted anyway" test -L "$fixture/l1-contracts/loose-file.bin"
  check "untracked symlink dirties git status (what the warning is about)" \
    bash -c "git -C '$fixture' status --porcelain | grep -q loose-file.bin"

  # 5f. Re-grafting is idempotent and repoints existing symlinks at the new entry.
  out=$(dl fake-l1-1111.tar.gz || true)
  check "existing symlink repointed to the new entry" \
    test "$(readlink -f "$fixture/l1-contracts/out/generated")" = "$CACHE_LINK_DIR/fake-l1-1111/out/generated"
  check "override file still respected on repoint" \
    grep -q "local-override" "$fixture/l1-contracts/out/bin/fake-binary"
  out=$(dl fake-l1-1111.tar.gz || true)
  check "second re-graft is a no-op that still succeeds" \
    test "$(readlink -f "$fixture/l1-contracts/out/generated")" = "$CACHE_LINK_DIR/fake-l1-1111/out/generated"
  check "fixture manifest accumulated the linked entries" \
    bash -c "grep -qx 'override-2222' '$fixture/.deps-manifest.linked' && grep -qx 'fake-l1-1111' '$fixture/.deps-manifest.linked'"
}

# ---------------------------------------------------------------------------------------------------
# Scenario 6: concurrent downloads of the same tarball extract into the store exactly once.
# ---------------------------------------------------------------------------------------------------
scenario_6_concurrency() {
  log "Scenario 6: 6 parallel downloads of one tarball (store lock)"
  local i pids=() fails=0
  for i in 1 2 3 4 5 6; do
    make_mini_repo "$test_root/scratch-repo-$i"
  done
  for i in 1 2 3 4 5 6; do
    (cd "$test_root/scratch-repo-$i" && ./ci3/cache_download concurrent-4444.tar.gz) >/dev/null 2>&1 &
    pids+=($!)
  done
  for p in "${pids[@]}"; do
    wait "$p" || ((++fails))
  done
  check "all 6 parallel downloads succeeded" test "$fails" -eq 0
  check "store holds exactly one entry for the tarball" test -d "$CACHE_LINK_DIR/concurrent-4444"
  check_not "no .tmp/.lock residue left in the store" \
    bash -c "ls -A '$CACHE_LINK_DIR' | grep -qE '^[.](tmp|lock)[.]'"
  local ok=1 links=1
  for i in 1 2 3 4 5 6; do
    [[ -e "$test_root/scratch-repo-$i/out/bin/c.txt" ]] || ok=0
    [[ -L "$test_root/scratch-repo-$i/out/bin" ]] || links=0
  done
  check "every repo's graft resolves through the store" test "$ok" -eq 1
  check "grafts are symlinks, not extracted copies" test "$links" -eq 1
}

# ---------------------------------------------------------------------------------------------------
# Scenario 7: gc — mark-and-sweep with manifest roots, symlink safety net, and tarball aging.
# ---------------------------------------------------------------------------------------------------
scenario_7_gc() {
  log "Scenario 7: gc"
  local out wt1="$test_root/wt1" wt2="$test_root/wt2"

  # Drop both worktrees (their manifests were the only roots for fake-l1-1111). The worktrees
  # contain an initialized submodule, hence the double --force.
  git -C "$fixture" worktree remove --force --force "$wt1" 2>/dev/null || rm -rf "$wt1"
  git -C "$fixture" worktree remove --force --force "$wt2" 2>/dev/null || rm -rf "$wt2"
  git -C "$fixture" worktree prune

  # A freshly extracted, unreferenced entry stands in for an in-progress create that has not yet
  # grafted symlinks or written its manifest — gc's recency guard must keep it.
  dl young-8888.tar.gz >/dev/null || true

  # Shape the fixture's own state: drop fake-l1-1111 and young-8888 (no manifest, no symlink — out/
  # removed below) and loose-3333 (manifest line removed but its symlink kept -> safety-net KEEP).
  rm -rf "$fixture/l1-contracts/out"
  sed -i '/^fake-l1-1111$/d; /^loose-3333$/d; /^young-8888$/d' "$fixture/.deps-manifest.linked"

  # Age every other entry past the recency guard so it is eligible for collection / safety-net scan.
  touch -m -d '2 hours ago' "$CACHE_LINK_DIR/fake-l1-1111" "$CACHE_LINK_DIR/concurrent-4444" \
    "$CACHE_LINK_DIR/loose-3333" "$CACHE_LINK_DIR/override-2222"

  out=$( (cd "$fixture" && scripts/worktrees.sh gc --dry-run 2>&1) || true )
  assert_contains "dry-run: young unreferenced entry kept (recency guard)" "$out" "KEEP (recently extracted): young-8888"
  assert_contains "dry-run: dead entry would be removed" "$out" "would remove entry: fake-l1-1111"
  assert_contains "dry-run: cross-clone entry is collected (documented limitation: scratch repos are not registered worktrees)" \
    "$out" "would remove entry: concurrent-4444"
  assert_contains "dry-run: safety net keeps symlinked-but-unmanifested entry" \
    "$out" "KEEP (still symlinked, not in manifest): loose-3333"
  assert_contains "dry-run: old dead tarball would be swept" "$out" "ancient-9999.tar.gz"
  assert_not_contains "dry-run: live entry not collected" "$out" "would remove entry: override-2222"
  check "dry-run removed nothing" test -d "$CACHE_LINK_DIR/fake-l1-1111"

  out=$( (cd "$fixture" && scripts/worktrees.sh gc 2>&1) || true )
  check "young unreferenced entry survived (recency guard)" test -d "$CACHE_LINK_DIR/young-8888"
  check_not "dead entry removed" test -d "$CACHE_LINK_DIR/fake-l1-1111"
  check_not "cross-clone entry removed (documented limitation)" test -d "$CACHE_LINK_DIR/concurrent-4444"
  check "live entry kept (fixture manifest root)" test -d "$CACHE_LINK_DIR/override-2222"
  check "symlinked-but-unmanifested entry kept (safety net)" test -d "$CACHE_LINK_DIR/loose-3333"
  check_not "old dead tarball swept" test -f "$CACHE_LOCAL_DIR/ancient-9999.tar.gz"
  check "young dead tarball kept" test -f "$CACHE_LOCAL_DIR/plain-1234.tar.gz"
  check "live entry's tarball kept" test -f "$CACHE_LOCAL_DIR/override-2222.tar.gz"
}

# ---------------------------------------------------------------------------------------------------
main() {
  echo -e "\033[1m=== worktrees.sh / cache_download link-mode test suite ===\033[0m"
  echo "test root: $test_root"

  make_fixture
  make_tarballs

  scenario_0_cache_local_suite
  scenario_1_dry_run
  scenario_2_create
  scenario_3_second_worktree
  scenario_4_thaw
  scenario_5_cache_download_modes
  scenario_6_concurrency
  scenario_7_gc

  log "=== Results ==="
  echo -e "\033[32mPassed: $passed\033[0m"
  echo -e "\033[31mFailed: $failed\033[0m"

  if [[ $failed -gt 0 ]]; then
    exit 1
  fi
}

main "$@"

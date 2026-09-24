#!/usr/bin/env bash
# Tests for the backport flow: backport_targets.sh (which labels become targets) and
# backport_to_staging.sh end to end against a local bare "GitHub", with `gh` replaced by a stub.
#
# Run: scripts/backport_to_staging.test.sh
# Needs git and jq; makes no network calls.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_root="$(mktemp -d /tmp/backport-test-XXXXXX)"
passed=0
failed=0

cleanup() { rm -rf "$test_root"; }
trap cleanup EXIT

log() { echo -e "\033[1m$1\033[0m"; }
pass() { echo -e "  \033[32m✓ $1\033[0m"; ((++passed)); }
fail() { echo -e "  \033[31m✗ $1\033[0m"; ((++failed)); }
assert_eq() { if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1: expected '$3', got '$2'"; fi; }

# --- backport_targets.sh ----------------------------------------------------------------------

targets() { # <action> <merged> <added label> <labels json>
  EVENT_ACTION="$1" MERGED="$2" ADDED_LABEL="$3" LABELS_JSON="$4" "$script_dir/backport_targets.sh"
}

log "backport_targets.sh"
assert_eq "merge backports to every label" \
  "$(targets closed true "" '["ci-full","backport-to-v6","backport-to-v5-next"]')" '["v5-next","v6"]'
assert_eq "merge without backport labels" "$(targets closed true "" '["ci-full"]')" '[]'
assert_eq "close without merge" "$(targets closed false "" '["backport-to-v6"]')" '[]'
assert_eq "label added after merge backports to that label only" \
  "$(targets labeled true backport-to-v6 '["backport-to-v5-next","backport-to-v6"]')" '["v6"]'
assert_eq "unrelated label added after merge" "$(targets labeled true ci-full '["backport-to-v6"]')" '[]'
assert_eq "label added before merge waits for the merge" \
  "$(targets labeled false backport-to-v6 '["backport-to-v6"]')" '[]'
assert_eq "bare prefix label is ignored" "$(targets closed true "" '["backport-to-"]')" '[]'

# --- backport_to_staging.sh fixtures ----------------------------------------------------------

remote="$test_root/remote.git"
dev="$test_root/dev"       # builds the history and plays "other people" pushing to the remote
runner="$test_root/runner" # the workflow's checkout, where the script runs
state="$test_root/state"   # the gh stub's view of GitHub
mkdir -p "$state" "$test_root/bin"

commit() { # <repo> <file> <content> <message>
  echo "$3" > "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" -c user.name=dev -c user.email=dev@example.com commit -q -m "$4"
}

# The script sources ci3/source from its checkout's root; this stub gives it the same strict mode
# and helpers without the CI environment.
write_ci3_stub() {
  mkdir -p "$dev/ci3" "$dev/scripts/merge-train"
  cat > "$dev/ci3/source" <<'EOF'
set -euo pipefail
export root=$(git rev-parse --show-toplevel)
export PATH="$root/ci3:$PATH"
EOF
  cp "$script_dir/../ci3/do_or_dryrun" "$dev/ci3/do_or_dryrun"
  cat > "$dev/scripts/merge-train/update-pr-body.sh" <<'EOF'
#!/usr/bin/env bash
echo "$1" >> "$BACKPORT_TEST_STATE/body_updates"
EOF
  chmod +x "$dev/scripts/merge-train/update-pr-body.sh"
}

write_gh_stub() {
  # PR metadata lives in $state/pr_<n>.json; the open staging PR number in $state/staging_pr.
  # $state/create_fails makes `pr create` fail after another actor has opened the PR.
  cat > "$test_root/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
state="$BACKPORT_TEST_STATE"
jq_filter="."
# gh --jq prints nothing for a null result (e.g. `.[0].number` on an empty list).
jqr() { jq -r "($jq_filter) | select(. != null)"; }
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --jq) jq_filter="$2"; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
case "${args[0]} ${args[1]}" in
  "pr view") jqr < "$state/pr_${args[2]}.json" ;;
  "pr list")
    if [[ -s "$state/staging_pr" ]]; then
      jq -cn --argjson n "$(cat "$state/staging_pr")" '[{number: $n}]' | jqr
    else
      echo '[]' | jqr
    fi ;;
  "pr create")
    if [[ -f "$state/create_fails" ]]; then
      echo 900 > "$state/staging_pr"
      echo "a pull request already exists" >&2
      exit 1
    fi
    echo 900 > "$state/staging_pr"
    echo "https://github.com/example/repo/pull/900" ;;
  *) echo "unexpected gh call: ${args[*]}" >&2; exit 1 ;;
esac
STUB
  chmod +x "$test_root/bin/gh"
}

# Wraps git so that the first push of the staging branch loses a race: another backport lands on
# the staging branch just before this one's push reaches the remote.
write_git_race_shim() {
  mkdir -p "$test_root/race-bin"
  cat > "$test_root/race-bin/git" <<STUB
#!/usr/bin/env bash
real_git=$(command -v git)
if [[ "\$1" == "push" && "\$*" == *backport-to-v6-staging* && ! -f "$state/raced" ]]; then
  touch "$state/raced"
  "\$real_git" -C "$dev" push -q origin race-winner:backport-to-v6-staging
fi
exec "\$real_git" "\$@"
STUB
  chmod +x "$test_root/race-bin/git"
}

add_pr() { # <number> <sha> <title>
  jq -n --arg sha "$2" --arg title "$3" \
    '{number: 0, title: $title, state: "MERGED", mergedAt: "2026-09-24T00:00:00Z", body: "", author: {login: "alice"}, mergeCommit: {oid: $sha}}' \
    > "$state/pr_$1.json"
}

run_backport() { # <pr> <target>; prints the exit code. Step outputs land in $state/output.
  local code=0
  : > "$state/output"
  (cd "$runner" && git fetch -q origin && git checkout -q --detach origin/next &&
    PATH="${EXTRA_PATH:-}$test_root/bin:$PATH" BACKPORT_TEST_STATE="$state" GITHUB_OUTPUT="$state/output" \
      bash <(cat "$script_dir/backport_to_staging.sh") "$1" "$2") > "$test_root/last.log" 2>&1 || code=$?
  echo "$code"
}

remote_log() { git -C "$remote" log --format=%s "${@:2}" "$1" 2>/dev/null; } # <ref> [git log args]

# History: v6 is cut from base, then next gains a clean change (#101), a change to a.txt that
# conflicts with a v6-only edit (#102), and a change v6 already carries (#103).
git init -q --bare "$remote"
git init -q -b next "$dev"
git -C "$dev" remote add origin "$remote"
write_ci3_stub
commit "$dev" a.txt "base" "chore: base"
git -C "$dev" add ci3 scripts
git -C "$dev" -c user.name=dev -c user.email=dev@example.com commit -q -m "chore: ci3 stub"
git -C "$dev" branch v6
commit "$dev" b.txt "next change" "feat: clean change (#101)"
sha_101=$(git -C "$dev" rev-parse HEAD)
commit "$dev" a.txt "next edit" "fix: conflicting change (#102)"
sha_102=$(git -C "$dev" rev-parse HEAD)
commit "$dev" c.txt "shared" "fix: shared change (#103)"
sha_103=$(git -C "$dev" rev-parse HEAD)
commit "$dev" d.txt "later" "feat: later change (#104)"
sha_104=$(git -C "$dev" rev-parse HEAD)
commit "$dev" e.txt "pr create race" "feat: another change (#105)"
sha_105=$(git -C "$dev" rev-parse HEAD)
git -C "$dev" checkout -q v6
commit "$dev" a.txt "v6 edit" "fix: v6-only edit"
commit "$dev" c.txt "shared" "fix: shared change, applied on v6"
git -C "$dev" checkout -q next
git -C "$dev" push -q origin next v6
git clone -q --no-checkout "$remote" "$runner"
git -C "$runner" config user.name bot
git -C "$runner" config user.email bot@example.com

write_gh_stub
add_pr 101 "$sha_101" "feat: clean change (#101)"
add_pr 102 "$sha_102" "fix: conflicting change (#102)"
add_pr 103 "$sha_103" "fix: shared change (#103)"
add_pr 104 "$sha_104" "feat: later change (#104)"
add_pr 105 "$sha_105" "feat: another change (#105)"

# --- backport_to_staging.sh cases -------------------------------------------------------------

log "conflict on the first backport to a target"
assert_eq "exits 3" "$(run_backport 102 v6)" "3"
assert_eq "staging branch is created at the target for the resolution PR" \
  "$(git -C "$remote" rev-parse backport-to-v6-staging)" "$(git -C "$remote" rev-parse v6)"
assert_eq "no staging PR is opened" "$(cat "$state/staging_pr" 2>/dev/null)" ""

log "clean backport"
assert_eq "exits 0" "$(run_backport 101 v6)" "0"
assert_eq "cherry-pick lands on the staging branch" "$(remote_log backport-to-v6-staging -1)" "feat: clean change (#101)"
assert_eq "staging PR is opened" "$(cat "$state/staging_pr")" "900"
assert_eq "staging PR body is refreshed" "$(tail -1 "$state/body_updates")" "backport-to-v6-staging"
assert_eq "reports no special result" "$(cat "$state/output")" ""
assert_eq "target branch is untouched" "$(remote_log v6 -1)" "fix: shared change, applied on v6"

log "change already present in the target"
before=$(git -C "$remote" rev-parse backport-to-v6-staging)
assert_eq "exits 0" "$(run_backport 103 v6)" "0"
assert_eq "staging branch is unchanged" "$(git -C "$remote" rev-parse backport-to-v6-staging)" "$before"
assert_eq "reports already-present to the workflow" "$(cat "$state/output")" "result=already-present"

log "push loses a race with a concurrent backport"
git -C "$dev" fetch -q origin backport-to-v6-staging
git -C "$dev" checkout -q -b race-winner origin/backport-to-v6-staging
commit "$dev" f.txt "winner" "feat: concurrent backport (#999)"
git -C "$dev" checkout -q next
write_git_race_shim
assert_eq "exits 0" "$(EXTRA_PATH="$test_root/race-bin:" run_backport 104 v6)" "0"
assert_eq "the race happened" "$([[ -f "$state/raced" ]] && echo yes)" "yes"
assert_eq "retry keeps the concurrent backport and adds this one" \
  "$(remote_log backport-to-v6-staging -2 | tr '\n' '|')" "feat: later change (#104)|feat: concurrent backport (#999)|"

log "another actor opens the staging PR first"
: > "$state/staging_pr"
touch "$state/create_fails"
assert_eq "exits 0" "$(run_backport 105 v6)" "0"
assert_eq "cherry-pick lands on the staging branch" "$(remote_log backport-to-v6-staging -1)" "feat: another change (#105)"
rm "$state/create_fails"

log "unknown PR"
assert_eq "exits 1, not the conflict code" "$(run_backport 106 v6)" "1"

echo ""
echo "Passed: $passed, Failed: $failed"
[[ $failed -eq 0 ]]

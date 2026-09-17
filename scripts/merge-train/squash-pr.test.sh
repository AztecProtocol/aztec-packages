#!/usr/bin/env bash
# End-to-end test for squash-pr.sh against a local bare "GitHub" and a shallow "runner" checkout,
# with `gh` replaced by a stub that answers from a full clone of the same history.
#
# Run: scripts/merge-train/squash-pr.test.sh
# Needs git and jq; makes no network calls.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_root="$(mktemp -d /tmp/squash-pr-test-XXXXXX)"
passed=0
failed=0

cleanup() { rm -rf "$test_root"; }
trap cleanup EXIT

log() { echo -e "\033[1m$1\033[0m"; }
pass() { echo -e "  \033[32m✓ $1\033[0m"; ((++passed)); }
fail() { echo -e "  \033[31m✗ $1\033[0m"; ((++failed)); }
assert_eq() { if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1: expected '$3', got '$2'"; fi; }

remote="$test_root/remote.git"
dev="$test_root/dev"       # full clone: builds the history and backs the gh stub
runner="$test_root/runner" # shallow clone: what CI3 hands to the script

commit() { # <repo> <file> <message> <author name> <author email>
  echo "$3" >> "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" -c user.name="$4" -c user.email="$5" commit -q -m "$3"
}

write_gh_stub() {
  # Answers the four calls squash-pr.sh makes, from the full clone, and applies --jq with the real
  # jq so the script's filters are exercised too. The PR body carries CRLF and trailing spaces, as
  # bodies from the API do.
  mkdir -p "$test_root/bin"
  cat > "$test_root/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
dev="$SQUASH_TEST_DEV"
jq_filter=""
rest=()
args=("$@")
i=0
while [[ $i -lt ${#args[@]} ]]; do
  case "${args[$i]}" in
    --jq) jq_filter="${args[$((i+1))]}"; i=$((i+2)) ;;
    --paginate) i=$((i+1)) ;;
    *) rest+=("${args[$i]}"); i=$((i+1)) ;;
  esac
done
emit() { if [[ -n "$jq_filter" ]]; then jq -r "$jq_filter"; else cat; fi; }
case "${rest[0]} ${rest[1]}" in
  "pr view")
    jq -n '{title: "feat: the squashed title", body: "Body line one.\r\n\r\nBody line two.  \r\n", author: {login: "alice"}, headRepository: {nameWithOwner: "org/repo"}, headRepositoryOwner: {login: "org"}, isCrossRepository: false}' | emit ;;
  "api /users/alice")
    jq -n '{id: 4242}' | emit ;;
  "api repos/{owner}/{repo}/compare/"*)
    spec="${rest[1]#repos/\{owner\}/\{repo\}/compare/}"; spec="${spec%%\?*}"
    base="${spec%%...*}"; head="${spec##*...}"
    mb=$(git -C "$dev" merge-base "origin/$base" "$head")
    n=$(git -C "$dev" rev-list --count "$mb..$head")
    jq -n --arg mb "$mb" --argjson n "$n" '{merge_base_commit: {sha: $mb}, total_commits: $n}' | emit ;;
  "api repos/{owner}/{repo}/pulls/42/commits")
    git -C "$dev" log --reverse --format='%H %an %ae %P' origin/next..origin/feature \
      | jq -R -s 'split("\n") | map(select(length > 0) | split(" ") | {sha: .[0], commit: {author: {name: .[1], email: .[2]}}, parents: (.[3:] | map({sha: .}))})' | emit ;;
  *) echo "gh stub: unexpected call: $*" >&2; exit 1 ;;
esac
STUB
  chmod +x "$test_root/bin/gh"
}

setup() {
  log "Setting up history in $test_root"
  git init -q --bare "$remote"
  git clone -q "$remote" "$dev" 2>/dev/null
  git -C "$dev" checkout -q -b next
  commit "$dev" base.txt "base 1" "Base Author" "base@example.com"
  commit "$dev" base.txt "base 2" "Base Author" "base@example.com"
  git -C "$dev" push -q origin next

  # PR branch: two commits by two authors, then next moves on and is merged in, then one more commit.
  git -C "$dev" checkout -q -b feature
  commit "$dev" feature.txt "feat 1" "alice" "alice@example.com"
  commit "$dev" feature.txt "feat 2" "bob" "bob@example.com"
  git -C "$dev" checkout -q next
  commit "$dev" base.txt "base 3" "Base Author" "base@example.com"
  git -C "$dev" push -q origin next
  git -C "$dev" checkout -q feature
  git -C "$dev" -c user.name=alice -c user.email=alice@example.com merge -q --no-edit next
  commit "$dev" feature.txt "feat 3" "alice" "alice@example.com"
  git -C "$dev" push -q origin feature

  write_gh_stub
}

# Clone the PR branch shallow at exactly its commit count, like ci3.yml's fetch-depth does. Only the
# PR head is fetched, but the remote keeps the default refspec, as actions/checkout leaves it.
checkout_runner() {
  rm -rf "$runner"
  local commit_count
  commit_count=$(git -C "$dev" rev-list --count origin/next..origin/feature)
  git clone -q --depth="$commit_count" --branch feature "file://$remote" "$runner"
  git -C "$runner" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
}

run_squash() {
  (cd "$runner" && SQUASH_TEST_DEV="$dev" PATH="$test_root/bin:$PATH" "$script_dir/squash-pr.sh" 42 feature next >"$test_root/run.log" 2>&1)
}

test_squash() {
  log "\nTest 1: squashes a multi-commit branch with a merge in it"
  checkout_runner
  local head_before tree_before objects_before merge_base
  head_before=$(git -C "$runner" rev-parse HEAD)
  tree_before=$(git -C "$runner" rev-parse 'HEAD^{tree}')
  objects_before=$(git -C "$runner" count-objects -v | awk '/^count|^in-pack/ {s+=$2} END {print s}')
  merge_base=$(git -C "$dev" merge-base origin/next origin/feature)

  if ! run_squash; then fail "squash-pr.sh exited non-zero"; sed 's/^/    /' "$test_root/run.log"; return 0; fi
  git -C "$dev" fetch -q origin

  local new_head
  new_head=$(git -C "$dev" rev-parse origin/feature)
  assert_eq "branch is one commit on top of the merge base" "$(git -C "$dev" rev-list --count "$merge_base..$new_head")" "1"
  assert_eq "parent is the merge base" "$(git -C "$dev" rev-parse "$new_head^")" "$merge_base"
  assert_eq "tree is unchanged" "$(git -C "$dev" rev-parse "$new_head^{tree}")" "$tree_before"
  assert_eq "author is the PR author" "$(git -C "$dev" log -1 --format='%an <%ae>' "$new_head")" "alice <4242+alice@users.noreply.github.com>"
  assert_eq "committer is the PR author" "$(git -C "$dev" log -1 --format='%cn <%ce>' "$new_head")" "alice <4242+alice@users.noreply.github.com>"

  local msg expected
  msg=$(git -C "$dev" log -1 --format='%B' "$new_head")
  expected=$'feat: the squashed title\n\nBody line one.\n\nBody line two.\n\nCo-authored-by: bob <bob@example.com>'
  assert_eq "message is title, cleaned body, and co-authors excluding the PR author" "$msg" "$expected"

  if grep -q -- '--deepen' "$test_root/run.log"; then fail "script deepened the checkout"; else pass "script did not deepen the checkout"; fi
  local objects_after
  objects_after=$(git -C "$runner" count-objects -v | awk '/^count|^in-pack/ {s+=$2} END {print s}')
  # The merge-base commit plus the tree objects it does not share with HEAD. A deepen would pull far more.
  if (( objects_after - objects_before <= 6 )); then
    pass "fetched only the merge-base commit ($((objects_after - objects_before)) new objects)"
  else
    fail "fetched $((objects_after - objects_before)) objects; expected a handful"
  fi
  assert_eq "runner HEAD is untouched" "$(git -C "$runner" rev-parse HEAD)" "$head_before"
}

test_idempotent() {
  log "\nTest 2: a single-commit branch is left alone"
  # The re-entry after the force-push: the runner now checks out the squashed head.
  checkout_runner
  local head_before
  head_before=$(git -C "$dev" rev-parse origin/feature)
  if ! run_squash; then fail "squash-pr.sh exited non-zero"; sed 's/^/    /' "$test_root/run.log"; return 0; fi
  git -C "$dev" fetch -q origin
  assert_eq "branch sha unchanged" "$(git -C "$dev" rev-parse origin/feature)" "$head_before"
  if grep -q "nothing to squash" "$test_root/run.log"; then pass "took the single-commit exit"; else fail "did not take the single-commit exit"; fi
}

test_lease() {
  log "\nTest 3: refuses to overwrite a push that landed after checkout"
  git -C "$dev" checkout -q feature
  git -C "$dev" reset -q --hard origin/feature
  commit "$dev" feature.txt "feat 4" "alice" "alice@example.com"
  commit "$dev" feature.txt "feat 5" "alice" "alice@example.com"
  git -C "$dev" push -q --force origin feature
  git -C "$dev" fetch -q origin
  checkout_runner
  # Someone pushes after the runner checked out.
  commit "$dev" feature.txt "feat 6 (raced)" "carol" "carol@example.com"
  git -C "$dev" push -q origin feature
  git -C "$dev" fetch -q origin
  local raced
  raced=$(git -C "$dev" rev-parse origin/feature)
  if run_squash; then
    fail "script should have failed the lease check"
  else
    pass "script failed instead of force-pushing over the newer commit"
  fi
  git -C "$dev" fetch -q origin
  assert_eq "remote branch still has the raced commit" "$(git -C "$dev" rev-parse origin/feature)" "$raced"
}

setup
test_squash
test_idempotent
test_lease

echo
log "Passed: $passed, Failed: $failed"
[[ $failed -eq 0 ]]

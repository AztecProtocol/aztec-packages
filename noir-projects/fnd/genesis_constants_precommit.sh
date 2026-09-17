#!/usr/bin/env bash
# Precommit reminder: staged changes that can rotate a protocol contract class id also move the genesis constants.
#
# The genesis nullifier tree is seeded with the protocol contracts' registration nullifiers, which are derived from
# their class ids. A class id rotation therefore moves GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH and
# GENESIS_ARCHIVE_ROOT, the C++ seed vector, and the L1 checkpoint fixtures. CI catches it, but slowly.
#
# This is a reminder, not evidence of freshness. Deciding whether a class id actually moved means compiling the
# contracts and computing the ids, which is far too slow for a commit hook, so the predicate below is a cheap and
# deliberately incomplete proxy: the protocol contract sources and manifests, and the compiler and transpiler that
# produce their bytecode. Changes elsewhere (a shared library the contracts pull in, a proving-tool change) can move
# the ids without tripping this. Nothing here blocks a commit.
set -euo pipefail

# Set by git when hooks run; it would make the relative paths below resolve against the git dir in a worktree.
unset GIT_DIR

cd "$(git rev-parse --show-toplevel)"

staged=$(git diff --cached --name-only --diff-filter=d) || exit 0
[ -n "$staged" ] || exit 0

watched=$(printf '%s\n' "$staged" | grep -E \
  '^(noir-projects/fnd/noir-contracts/contracts/protocol/|noir/noir-repo$|avm-transpiler/)' || true)
[ -n "$watched" ] || exit 0

# Only a staged edit to the GENESIS_ constants themselves counts as "already handled". A staged constants.nr that
# changes some unrelated constant proves nothing about the genesis values.
constants_nr=noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr
if git diff --cached -- "$constants_nr" | grep -q '^[+-]pub global GENESIS_'; then
  exit 0
fi

echo ""
echo -e "\033[33mReminder:\033[0m these staged changes can rotate a protocol contract class id:"
printf '%s\n' "$watched" | sed 's/^/  - /'
echo ""
echo "  If a class id moved, the genesis constants and the L1 checkpoint fixtures moved with it. Regenerate with:"
echo "    noir-projects/fnd/scripts/regenerate_genesis_constants.sh --fixtures"
echo "  Or check without writing anything:"
echo "    noir-projects/fnd/scripts/regenerate_genesis_constants.sh --check"
echo ""

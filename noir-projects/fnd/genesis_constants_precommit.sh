#!/usr/bin/env bash
# Precommit reminder: staged changes that can rotate a protocol contract class id also move the genesis.
#
# The genesis nullifier tree is seeded with the protocol contracts' registration nullifiers, which are derived from
# their class ids. A class id rotation therefore moves protocol/genesis/genesis.json (the nullifiers and the roots
# they produce) and wsdb's C++ seed vector. CI catches it, but slowly.
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

# A staged regeneration counts as "already handled".
if printf '%s\n' "$staged" | grep -qx 'protocol/genesis/genesis.json'; then
  exit 0
fi

echo ""
echo -e "\033[33mReminder:\033[0m these staged changes can rotate a protocol contract class id:"
printf '%s\n' "$watched" | sed 's/^/  - /'
echo ""
echo "  If a class id moved, the genesis moved with it. Regenerate with:"
echo "    noir-projects/fnd/scripts/regenerate_genesis_constants.sh"
echo "  Or check without writing anything:"
echo "    noir-projects/fnd/scripts/regenerate_genesis_constants.sh --check"
echo ""

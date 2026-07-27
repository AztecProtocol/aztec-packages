#!/usr/bin/env bash
#
# Generates contracts/test/test_token_contract from the canonical app/token_contract.
#
# Canonical Token (app/token_contract) delivers notes with constrained message delivery and is the
# production / docs source of truth. TestToken is its unconstrained-delivery sibling, used by e2e
# tests where a token is just a unit-of-account vehicle rather than the test subject -- there,
# constrained delivery's first-send handshake bootstrap would distort step/log/nullifier counts that
# those tests assert on. Generating TestToken from canonical Token (rather than maintaining a second
# hand-written contract) keeps the two from drifting. You rarely run this by hand: local builds
# regenerate TestToken in place, the precommit hook (noir-projects/precommit.sh) regenerates and stages
# it when you commit a canonical Token change, and CI runs --check as a backstop.
#
# Usage:
#   gen_test_token.sh           regenerate contracts/test/test_token_contract in place
#   gen_test_token.sh --check   regenerate into a temp dir and fail if it differs from the committed
#                               copy (CI runs this so a stale committed TestToken can't land; locally
#                               the precommit hook keeps the committed copy fresh)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/contracts/app/token_contract"
DST="$ROOT/contracts/test/test_token_contract"

check=false
[ "${1:-}" = "--check" ] && check=true

# Generate into $1 from canonical Token. Only main.nr is carried over (plus Nargo.toml): TestToken's
# Noir TXE tests would duplicate canonical Token's -- identical except for delivery mode, already
# covered there and in constrained_delivery_test_contract -- and double TXE test time, so the test/
# tree is not copied and the `mod test;` declaration is stripped.
gen_into() {
  local dst=$1
  mkdir -p "$dst/src"
  cp "$SRC/Nargo.toml" "$dst/Nargo.toml"
  cp "$SRC/src/main.nr" "$dst/src/main.nr"

  # main.nr transforms (perl: portable \b, in-place edit):
  #   1. drop the `mod test;` declaration (the test/ tree is not copied)
  #   2. flip constrained -> unconstrained delivery at every delivery site
  #   3. rename the contract identifier Token -> TestToken: the `pub contract Token` declaration and
  #      its `Token::` self-references only, so a bare "Token" in a future comment/string is untouched
  perl -i -ne '
    next if /^mod test;$/;
    s/MessageDelivery::onchain_constrained/MessageDelivery::onchain_unconstrained/g;
    s/\bpub contract Token\b/pub contract TestToken/;
    s/\bToken::/TestToken::/g;
    print;
  ' "$dst/src/main.nr"

  # Rename the package so canonical Token and TestToken compile side-by-side in the workspace.
  perl -i -pe 's/^name = "token_contract"$/name = "test_token_contract"/' "$dst/Nargo.toml"

  # Mark the outputs as generated (see CLAUDE.md: never hand-edit generated files). Prepended after
  # the substitutions so the header text is not itself rewritten.
  gen_header "$dst/src/main.nr" "//"
  gen_header "$dst/Nargo.toml" "#"
}

gen_header() {
  local file=$1 comment=$2 tmp
  tmp=$(mktemp)
  {
    printf '%s GENERATED FILE - DO NOT EDIT.\n' "$comment"
    printf '%s Generated from contracts/app/token_contract by scripts/gen_test_token.sh.\n' "$comment"
    printf '%s Edit canonical Token and rerun that script instead.\n' "$comment"
    cat "$file"
  } >"$tmp"
  mv "$tmp" "$file"
}

if $check; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  gen_into "$tmp"
  if ! diff -ruN "$DST" "$tmp" >/dev/null; then
    echo "ERROR: $DST is out of sync with canonical Token." >&2
    echo "Run noir-projects/labs/noir-contracts/scripts/gen_test_token.sh and commit the result." >&2
    diff -ruN "$DST" "$tmp" >&2 || true
    exit 1
  fi
else
  rm -rf "$DST"
  gen_into "$DST"
  echo "Generated $DST from $SRC." >&2
fi

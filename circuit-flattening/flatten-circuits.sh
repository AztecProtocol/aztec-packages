#!/usr/bin/env bash
# Generate the flattened circuit artifacts — the three output types described
# in README.md: per-circuit `-readable` and `-inlined` files, plus the combined
# `chain-example.inlined.nr`. Everything lands in output/, alongside a
# `circuits-source-commit.txt` recording the repo commit the artifacts were
# generated from (the outer repo holds both the circuit source and the noir
# pin, so its HEAD is the version that matters).
#
# Prerequisite: the generator patch must already be applied to the noir
# submodule (run ./apply-patch.sh first); otherwise the --show-monomorphized /
# --inline-monomorphized flags don't exist and compilation fails.
#
# This script never touches the patch. After editing the generator code in the
# submodule, re-export the patch with ./export-patch.sh.
#
# Usage:
#   ./flatten-circuits.sh                 # compare commit, prompt, then all circuits + chain
#   ./flatten-circuits.sh --yes           # skip the prompt (for automation)
#   ./flatten-circuits.sh <pkg> [pkg...]  # regenerate only these (no prompt; record left as-is)
set -euo pipefail

ASSUME_YES=false
PKGS=()
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=true ;;
    -*) echo "usage: $0 [--yes] [package...]" >&2; exit 2 ;;
    *) PKGS+=("$arg") ;;
  esac
done

FLAT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$FLAT/.." && pwd)"
NOIR="$ROOT/noir/noir-repo"
NARGO="$NOIR/target/release/nargo"
PROTO="$ROOT/noir-projects/noir-protocol-circuits"
OUT="$FLAT/output"
mkdir -p "$OUT"
VERSION_FILE="$OUT/circuits-source-commit.txt"

CIRCUITS=(
  private_kernel_init
  private_kernel_inner
  private_kernel_reset
  private_kernel_reset_tail
  private_kernel_reset_tail_to_public
  hiding_kernel_to_public
  hiding_kernel_to_rollup
  rollup_tx_base_public
)

# Crypto / serialization plumbing kept out of the inlined body (printed as
# standalone definitions instead). Keeps the inlined artifact focused on
# protocol logic; the excluded functions still appear once at the bottom.
NO_INLINE="sha256_var,sha256_compression,sha256_to_field,digest,accumulate_sha256,sha_merkle_hash,build_msg_block,build_msg_block_helper,field_from_bytes_32_trunc,serialize_to_columns,to_columns,set_snapshot_in_cols,set_field_array_in_cols,set_gas_in_cols,set_gas_fees_in_cols,set_public_call_request_in_cols,set_public_call_request_array_in_cols,set_public_logs_in_cols,set_public_data_writes_in_cols,set_protocol_contracts_in_cols,stream_serialize,write,serialize"

short() { printf '%s' "${1:0:9}"; }

generate() {
  local pkg="$1" idx="$2" total="$3"
  local name="${pkg//_/-}"
  echo "[$idx/$total] $pkg: starting (readable)..."
  (cd "$PROTO" && "$NARGO" compile --package "$pkg" --show-monomorphized \
      --silence-warnings > "$OUT/$name.monomorphized-readable.nr")
  echo "[$idx/$total] $pkg: readable done, inlining..."
  (cd "$PROTO" && "$NARGO" compile --package "$pkg" --inline-monomorphized \
      --no-inline-fns "$NO_INLINE" \
      --show-monomorphized --silence-warnings > "$OUT/$name.monomorphized-inlined.nr")
  echo "[$idx/$total] $pkg: done ($(wc -l < "$OUT/$name.monomorphized-readable.nr") readable / $(wc -l < "$OUT/$name.monomorphized-inlined.nr") inlined lines)"
}

current_commit="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"

if [ ${#PKGS[@]} -gt 0 ]; then
  CIRCUITS=("${PKGS[@]}")
  full_run=false
else
  full_run=true
fi
total=${#CIRCUITS[@]}

# On a full run, compare the recorded source commit with the current checkout
# and let the user decide whether regenerating is worth it.
if $full_run; then
  stored=""
  if [ -f "$VERSION_FILE" ]; then
    stored="$(awk '/^commit:/{print $2; exit}' "$VERSION_FILE")"
  fi

  if [ -z "$current_commit" ]; then
    echo "Note: $ROOT is not a git checkout; cannot compare circuit versions."
  elif [ -z "$stored" ]; then
    echo "No recorded source commit in output/ yet — this is the first generation."
  elif [ "$stored" = "$current_commit" ]; then
    echo "output/ already corresponds to your current commit ($(short "$current_commit"))."
  elif ! git -C "$ROOT" cat-file -e "${stored}^{commit}" 2>/dev/null; then
    echo "output/ was generated from commit $(short "$stored"), which is not in your local git history."
  elif git -C "$ROOT" merge-base --is-ancestor "$stored" "$current_commit"; then
    behind="$(git -C "$ROOT" rev-list --count "${stored}..${current_commit}")"
    echo "Your checkout is LATER than output/:"
    echo "  output generated from $(short "$stored"); your HEAD $(short "$current_commit") is $behind commit(s) newer."
  elif git -C "$ROOT" merge-base --is-ancestor "$current_commit" "$stored"; then
    ahead="$(git -C "$ROOT" rev-list --count "${current_commit}..${stored}")"
    echo "Your checkout is EARLIER than output/:"
    echo "  output generated from $(short "$stored"), which is $ahead commit(s) newer than your HEAD $(short "$current_commit")."
  else
    echo "Your checkout ($(short "$current_commit")) and output/'s commit ($(short "$stored")) have DIVERGED."
  fi

  if [ "$ASSUME_YES" != true ]; then
    if [ -t 0 ]; then
      read -r -p "Regenerate all $total circuits now? [y/N] " reply
      case "$reply" in
        y|Y|yes|YES) ;;
        *) echo "Skipped; output/ left unchanged."; exit 0 ;;
      esac
    else
      echo "(non-interactive: proceeding with regeneration; pass --yes to silence this note.)"
    fi
  fi
fi

echo
echo "Flattening $total circuit(s) into $OUT."
echo "Heads up: this takes a while — each circuit is compiled twice (-readable"
echo "and -inlined), and a full run rebuilds nargo first. Progress prints below."
echo

if $full_run; then
  echo "Building nargo (release)..."
  (cd "$NOIR" && cargo build --release -p nargo_cli --bin nargo)
  echo "nargo built."
  echo
fi

i=0
for pkg in "${CIRCUITS[@]}"; do
  i=$((i + 1))
  generate "$pkg" "$i" "$total"
done

# Reassemble the cross-circuit chain from the per-circuit -inlined files just
# regenerated. Needs all stages' -inlined files present (built above on a full
# run; left from a previous run when only a subset was passed).
echo
echo "Assembling chain-example.inlined.nr..."
python3 "$FLAT/build_chain.py"

# Record the source commit, but only on a full run — a subset run leaves some
# artifacts at an older commit, so updating the stamp would misrepresent them.
if $full_run && [ -n "$current_commit" ]; then
  {
    echo "commit: $current_commit"
    echo "branch: $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    echo "generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$VERSION_FILE"
  echo
  echo "Recorded source commit $(short "$current_commit") in $VERSION_FILE."
elif ! $full_run; then
  echo
  echo "Subset run: $VERSION_FILE left unchanged (other artifacts may be from a different commit)."
fi

echo
echo "All done. Artifacts in $OUT."

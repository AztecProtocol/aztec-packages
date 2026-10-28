#!/usr/bin/env bash
# check-attester.sh — Aztec attester health check.
# Reads ATTESTER (one or more addresses, comma- or space-separated), ROLLUP,
# GSE, ETH_RPC from env. Prints a labeled report and a verdict per attester.
#
# Source: Aztec operator docs
# Usage:
#   ATTESTER=0x...                ROLLUP=0x... GSE=0x... ETH_RPC=https://... ./check-attester.sh
#   ATTESTER=0xaaa...,0xbbb...    ROLLUP=0x... GSE=0x... ETH_RPC=https://... ./check-attester.sh

set -u

: "${ATTESTER:?ATTESTER env var required (one or more addresses, comma-separated)}"
: "${ROLLUP:?ROLLUP env var required}"
: "${GSE:?GSE env var required}"
: "${ETH_RPC:?ETH_RPC env var required}"

if ! command -v cast >/dev/null 2>&1; then
  echo "cast (Foundry) not found in PATH. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
fi

# Protocol constants as of v4. Both can be changed by governance; if verdicts
# look wrong, compare against getLocalEjectionThreshold() on the Rollup.
ACTIVATION_STAKE=200000
EJECTION_THRESHOLD=190000

# ── ANSI colors (only when stdout is a terminal) ──
if [ -t 1 ]; then
  C_HEAD=$'\033[1;36m'
  C_LABEL=$'\033[2m'
  C_VAL=$'\033[0m'
  C_RESET=$'\033[0m'
  C_OK=$'\033[1;32m'
  C_WARN=$'\033[1;33m'
  C_BAD=$'\033[1;31m'
else
  C_HEAD= C_LABEL= C_VAL= C_RESET= C_OK= C_WARN= C_BAD=
fi

field()   { printf "  ${C_LABEL}%-14s${C_VAL}%s${C_RESET}\n" "$1" "$2"; }
section() { printf "\n${C_HEAD}── %s ──${C_RESET}\n" "$1"; }

# Strip cast's "[2.431e75]"-style annotations and surrounding whitespace.
strip_annot() { sed -E 's/ *\[[^]]*\]//g'; }

check_one() {
  local ATT="$1"
  section "$ATT"

  # ── Status ──
  local STATUS
  STATUS=$(cast call "$ROLLUP" "getStatus(address)(uint8)" "$ATT" --rpc-url "$ETH_RPC" | strip_annot | xargs)
  case "$STATUS" in
    0) field "status" "NONE (0)" ;;
    1) field "status" "VALIDATING (1)" ;;
    2) field "status" "ZOMBIE (2)" ;;
    3) field "status" "EXITING (3)" ;;
    *) field "status" "UNKNOWN ($STATUS)" ;;
  esac

  # ── Effective balance ──
  local BAL_RAW BAL_AZTEC BAL_INT
  BAL_RAW=$(cast call "$GSE" "effectiveBalanceOf(address,address)(uint256)" "$ROLLUP" "$ATT" --rpc-url "$ETH_RPC" | strip_annot | awk '{print $1}')
  BAL_AZTEC=$(cast to-unit "$BAL_RAW" ether)
  BAL_INT=${BAL_AZTEC%%.*}
  field "balance" "$BAL_INT AZTEC"

  # ── Exit state ──
  local EXIT_RAW EXIT_INNER EX_WID EX_AMT EX_AT EX_REC EX_IR EX_EX
  EXIT_RAW=$(cast call "$ROLLUP" "getExit(address)((uint256,uint256,uint256,address,bool,bool))" "$ATT" --rpc-url "$ETH_RPC" | strip_annot)
  EXIT_INNER=$(echo "$EXIT_RAW" | sed -E 's/^\(//; s/\)$//')
  IFS=',' read -r EX_WID EX_AMT EX_AT EX_REC EX_IR EX_EX <<< "$EXIT_INNER"
  EX_EX=$(echo "$EX_EX" | xargs)
  EX_AT=$(echo "$EX_AT" | xargs)
  EX_REC=$(echo "$EX_REC" | xargs)
  if [ "$EX_EX" = "true" ]; then
    field "exit" "in progress, exitableAt=$EX_AT, recipient=$EX_REC"
  else
    field "exit" "none"
  fi

  # ── Config ──
  local CFG_RAW CFG_INNER WD
  CFG_RAW=$(cast call "$ROLLUP" "getConfig(address)(((uint256,uint256),address))" "$ATT" --rpc-url "$ETH_RPC" | strip_annot)
  CFG_INNER=$(echo "$CFG_RAW" | sed -E 's/^\(//; s/\)$//')
  WD=$(echo "$CFG_INNER" | sed -E 's/^\([^)]+\), *(.+)$/\1/' | xargs)
  field "withdrawer" "$WD"

  # ── Verdict ──
  local SLASHED=$((ACTIVATION_STAKE - BAL_INT))
  case "$STATUS" in
    1)
      if [ "$BAL_INT" -ge "$ACTIVATION_STAKE" ]; then
        field "verdict" "${C_OK}HEALTHY${C_RESET} — active with full stake"
      elif [ "$BAL_INT" -ge "$EJECTION_THRESHOLD" ]; then
        field "verdict" "${C_WARN}ACTIVE, SLASHED${C_RESET} — slashed $SLASHED AZTEC; still above the $EJECTION_THRESHOLD ejection threshold. Further slashes below it eject this attester."
      else
        field "verdict" "${C_BAD}BELOW EJECTION THRESHOLD${C_RESET} — balance under $EJECTION_THRESHOLD AZTEC; ejection imminent or pending"
      fi
      ;;
    0)
      field "verdict" "${C_BAD}NOT REGISTERED${C_RESET} — no stake on this rollup. Fresh deposits show NONE for 1 to 2 epochs until the entry queue is flushed; otherwise check the address and the network."
      ;;
    2)
      field "verdict" "${C_BAD}ZOMBIE${C_RESET} — slashed below the global threshold and no longer attesting. The withdrawer can recover remaining stake via initiateWithdraw."
      ;;
    3)
      field "verdict" "${C_WARN}EXITING${C_RESET} — withdrawal initiated; finalize after the exit delay passes (exitableAt above)."
      ;;
    *)
      field "verdict" "${C_BAD}UNKNOWN STATUS${C_RESET} — unexpected value $STATUS"
      ;;
  esac
}

for ATT in $(echo "$ATTESTER" | tr ',' ' '); do
  check_one "$ATT"
done
echo

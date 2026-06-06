#!/bin/bash
# phone-bench.sh — THE canonical, SERIAL phone bench. Run the WHOLE phone session
# (cross-check + timing for one montmul variant) under ONE exclusive flock hold so
# benchmarks are never polluted by another agent touching the phone mid-run.
#
# Usage (ALWAYS via flock — the wrapper re-execs itself under the lock if not held):
#   bash phone-bench.sh <port> <montmul> [logn] [reps]
# It will block until the phone is free, run a clean session, print results, release.
#
# Requires: a vite dev server already listening on <port> in the agent's worktree,
# with MSM_WEBGPU_RESULTS_FILE=~/localclaudebox/phonetests/fastbench_results_<port>.jsonl
#
# Output: machine-readable lines:
#   PHONE_BENCH cross_ok=<true|false|timeout> montmul=<v>
#   PHONE_BENCH median_ms=<n> min_ms=<n> walls=[...] montmul=<v>

set -u
LOCK=/tmp/msm_phone_bench.lock
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

# Re-exec under exclusive flock if we're not already holding it (the queue).
if [ "${PHONE_BENCH_LOCKED:-}" != "1" ]; then
  echo "[phone-bench] waiting for exclusive phone lock (serial queue, max 900s)..."
  # -w 900: give up after 15 min instead of blocking forever, so an orphaned
  # holder (a dead agent's wedged phone-bench child) can't starve everyone.
  # NOT exec, so the timeout fallback below can run.
  env PHONE_BENCH_LOCKED=1 flock -w 900 -x "$LOCK" "$SELF" "$@"
  rc=$?
  [ "$rc" -eq 1 ] && echo "PHONE_BENCH cross_ok=lock_timeout montmul=${2:-?} (lock held >900s; orphan? rerun)"
  exit "$rc"
fi
# ---- from here we hold the lock exclusively ----

PORT="${1:?port}"; MM="${2:?montmul}"; LOGN="${3:-17}"; REPS="${4:-5}"
# MODE=msm (default): the usual MSM cross-check + timing. MODE=chain: the
# self-contained montmul-chain correctness bench (no MSM/SRS). Both run inside
# this same exclusive flock, so only one phone session ever runs at a time.
MODE="${5:-msm}"; CHAIN_K="${6:-16}"; NVEC="${7:-256}"
# MODE=micro extra args: op (mul|inv) and wordsize (13|15).
MICRO_OP="${8:-mul}"; MICRO_WS="${9:-13}"
# Scalar distribution for the timing run (env var, inherited through the flock
# re-exec). Default A (uniform random). Set PROFILE=E etc. to time structured
# distributions without disturbing the positional-arg interface.
PROFILE="${PROFILE:-A}"
# PK14=1 appends &pk14=1 to the cross-check + timing URLs (arena branch's
# packed-14-bit safegcd inverse, walker-only). Env var so the positional-arg
# interface is unchanged. Composes with montmul=cios_native.
PK14_Q=""; [ "${PK14:-}" = "1" ] && PK14_Q="&pk14=1"
RF="$HOME/localclaudebox/phonetests/fastbench_results_${PORT}.jsonl"
PKG=com.android.chrome; ACT="$PKG/com.google.android.apps.chrome.Main"
# Device targeting: ADB_SERIAL selects which phone (required when >1 is attached).
# Defaults to the first attached device, so existing single-phone callers are
# unchanged. The lock stays GLOBAL (one phone session at a time across all
# devices/agents) so the shared per-port results file is never raced.
ADB_SERIAL="${ADB_SERIAL:-$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')}"
ADB="adb -s ${ADB_SERIAL}"
echo "[phone-bench] LOCK ACQUIRED $(date +%H:%M:%S) port=$PORT montmul=$MM logn=$LOGN reps=$REPS dev=$ADB_SERIAL"

# --- phone hygiene ---
$ADB shell svc power stayon true >/dev/null 2>&1
$ADB shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1
if $ADB shell dumpsys window 2>/dev/null | grep -q "isKeyguardShowing=true"; then
  echo "PHONE_BENCH ERROR=phone_locked montmul=$MM dev=$ADB_SERIAL"; exit 3
fi
$ADB reverse tcp:$PORT tcp:$PORT >/dev/null 2>&1

launch_and_wait() { # <url-suffix> <desc> <timeout-s>; echoes the new last row
  local url="http://localhost:$PORT/dev/msm-webgpu/index.html?coi=1&$1"
  local base; base=$(wc -l < "$RF" 2>/dev/null || echo 0)
  $ADB shell am force-stop $PKG >/dev/null 2>&1; sleep 1
  # The URL contains '&' (multiple autorun query params). It is relayed to the
  # PHONE's /system/bin/sh by `adb shell`; an unquoted '&' there is a shell
  # background operator, so `am` would see only the URL up to the first '&' and
  # Chrome would open the bare page (autorun never fires). Single-quote the URL
  # INSIDE the adb shell command line so the phone shell passes it to `am` whole.
  $ADB shell "am start -a android.intent.action.VIEW -d '$url' -n $ACT" >/dev/null 2>&1
  local t=$3
  while [ "$t" -gt 0 ]; do
    sleep 5; t=$((t-5))
    local cur; cur=$(wc -l < "$RF" 2>/dev/null || echo 0)
    [ "$cur" -gt "$base" ] && { tail -1 "$RF"; return 0; }
  done
  return 1
}

# --- montmul-chain correctness mode (MODE=chain): self-contained, no MSM/SRS.
#     Runs inside this same flock hold, prints PHONE_BENCH cross_ok, and exits. ---
if [ "$MODE" = chain ]; then
  echo "[phone-bench] montmul-chain ${MM} K=$CHAIN_K nvec=$NVEC..."
  CHROW=$(launch_and_wait "autorun=montmul-chain&montmul=$MM&chain_k=$CHAIN_K&nvec=$NVEC" chain 240)
  if [ -z "${CHROW:-}" ]; then
    echo "PHONE_BENCH cross_ok=timeout montmul=$MM mode=chain"
  else
    CHOK=$(printf '%s' "$CHROW" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const r=JSON.parse(d);const ok=(r.results&&"cross_ok"in r.results)?r.results.cross_ok:(("cross_ok"in r)?r.cross_ok:"?");process.stdout.write(String(ok));}catch(e){process.stdout.write("parsefail")}})' 2>/dev/null)
    echo "PHONE_BENCH cross_ok=$CHOK montmul=$MM mode=chain"
  fi
  echo "[phone-bench] LOCK RELEASING $(date +%H:%M:%S) montmul=$MM mode=chain"
  exit 0
fi

# --- isolated montmul/inverse microbench (MODE=micro): no MSM/SRS. op + wordsize
#     in args 8/9; montmul=$MM, chain=$CHAIN_K, threads=$NVEC, reps=$REPS. ---
if [ "$MODE" = micro ]; then
  echo "[phone-bench] micro op=$MICRO_OP ws=$MICRO_WS mm=$MM K=$CHAIN_K threads=$NVEC reps=$REPS..."
  MROW=$(launch_and_wait "autorun=micro&op=$MICRO_OP&wordsize=$MICRO_WS&montmul=$MM&chain_k=$CHAIN_K&threads=$NVEC&reps=$REPS" micro 240)
  if [ -z "${MROW:-}" ]; then
    echo "PHONE_BENCH median_ms=timeout op=$MICRO_OP ws=$MICRO_WS"
  else
    printf '%s' "$MROW" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const r=JSON.parse(d);const m=r.results?.medianMs,mn=r.results?.minMs;process.stdout.write("PHONE_BENCH median_ms="+(m!=null?Number(m).toFixed(3):(r.state==="error"?("ERR:"+String(r.error||"").slice(0,80)):"?"))+" min_ms="+(mn!=null?Number(mn).toFixed(3):"?")+" op="+process.argv[1]+" ws="+process.argv[2]+" mm="+process.argv[3])}catch(e){process.stdout.write("PHONE_BENCH median_ms=parsefail")}})' "$MICRO_OP" "$MICRO_WS" "$MM"
    echo
  fi
  echo "[phone-bench] LOCK RELEASING $(date +%H:%M:%S) op=$MICRO_OP ws=$MICRO_WS mode=micro"
  exit 0
fi

# --- FAST matrix mode (MODE=matrix): ONE page load runs the whole montmul×inverse
#     sweep IN-PAGE (shared point pool + WGSL-keyed pipeline cache, no WASM, no
#     reloads). CONFIGS env = comma list of montmul:inv (inv=loop|pk14); order by
#     montmul so pk14 toggles reuse the cache (walker-only recompile). ---
if [ "$MODE" = matrix ]; then
  CONFIGS="${CONFIGS:-karat:loop,karat:pk14,cios_unrolled:loop,cios_unrolled:pk14,cios_native:loop,cios_native:pk14}"
  echo "[phone-bench] matrix logn=$LOGN reps=$REPS profile=$PROFILE configs=$CONFIGS ..."
  MXROW=$(launch_and_wait "autorun=msm-matrix&logn=$LOGN&reps=$REPS&scalar_dist=profile&profile=$PROFILE&configs=$CONFIGS" matrix 360)
  if [ -z "${MXROW:-}" ]; then
    echo "PHONE_BENCH matrix=timeout"
  else
    printf '%s' "$MXROW" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const r=JSON.parse(d);const rows=r.results?.rows||[];const base=rows.find(x=>x.montmul==="karat"&&!x.pk14)?.median;rows.forEach(x=>console.log("PHONE_BENCH matrix montmul="+x.montmul+" inv="+(x.pk14?"pk14":"loop")+" median_ms="+x.median+" min_ms="+x.min+" build_ms="+x.buildMs+(base?" pct="+(x.median/base*100).toFixed(0):"")));}catch(e){console.log("PHONE_BENCH matrix=parsefail")}})'
  fi
  echo "[phone-bench] LOCK RELEASING $(date +%H:%M:%S) mode=matrix"
  exit 0
fi

# --- 1) cross-check (correctness) ---
echo "[phone-bench] cross-check ${MM}..."
CCROW=$(launch_and_wait "autorun=msm-cross-check&logn=$LOGN&montmul=$MM&wordsize=${MSM_WS:-13}$PK14_Q" cc 240)
if [ -z "${CCROW:-}" ]; then
  echo "PHONE_BENCH cross_ok=timeout montmul=$MM"
else
  CCOK=$(printf '%s' "$CCROW" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const r=JSON.parse(d);const ok=(r.results&&"cross_ok"in r.results)?r.results.cross_ok:(("cross_ok"in r)?r.cross_ok:"?");process.stdout.write(String(ok));}catch(e){process.stdout.write("parsefail")}})' 2>/dev/null)
  echo "PHONE_BENCH cross_ok=$CCOK montmul=$MM"
fi

# --- 2) timing (GPU-only, warm SRS, no WASM) ---
echo "[phone-bench] timing ${MM} profile=${PROFILE}..."
TROW=$(launch_and_wait "autorun=msm-bench&no_wasm=1&logn=$LOGN&reps=$REPS&scalar_dist=profile&profile=$PROFILE&montmul=$MM&wordsize=${MSM_WS:-13}$PK14_Q" time 240)
if [ -z "${TROW:-}" ]; then
  echo "PHONE_BENCH median_ms=timeout montmul=$MM"
else
  printf '%s' "$TROW" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const r=JSON.parse(d);const w=(r.results?.samples??[]).map(s=>s.wallMs).filter(Number.isFinite);const s=[...w].sort((a,b)=>a-b);const med=r.results?.medianWallMs ?? (s.length?s[s.length>>1]:null);process.stdout.write("PHONE_BENCH median_ms="+(med?med.toFixed(1):"?")+" min_ms="+(s.length?s[0].toFixed(1):"?")+" walls=["+w.map(x=>x.toFixed(1)).join(",")+"] montmul="+process.argv[1])}catch(e){process.stdout.write("PHONE_BENCH median_ms=parsefail montmul="+process.argv[1])}})' "$MM"
  echo
fi
echo "[phone-bench] LOCK RELEASING $(date +%H:%M:%S) montmul=$MM"
